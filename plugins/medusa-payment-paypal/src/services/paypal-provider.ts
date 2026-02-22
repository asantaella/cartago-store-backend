import { EOL } from "os"
import {
  AbstractPaymentProcessor,
  isPaymentProcessorError,
  PaymentProcessorContext,
  PaymentProcessorError,
  PaymentProcessorSessionResponse,
  PaymentSessionStatus,
} from "@medusajs/medusa"
import {
  PaypalOptions,
  PaypalOrder,
  PaypalOrderStatus,
  PurchaseUnits,
} from "../types"
import { humanizeAmount } from "medusa-core-utils"
import { roundToTwo } from "./utils/utils"
import { CreateOrder, PaypalSdk } from "../core"
import { Logger } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

class PayPalProviderService extends AbstractPaymentProcessor {
  static identifier = "paypal"

  protected readonly options_: PaypalOptions
  protected paypal_: PaypalSdk
  protected readonly logger_: Logger | undefined

  constructor({ logger }: { logger?: Logger }, options: PaypalOptions) {
    super({ logger })

    this.logger_ = logger
    this.options_ = options
    this.init()
  }

  protected init(): void {
    this.paypal_ = new PaypalSdk({
      ...this.options_,
      logger: this.logger_,
    })
  }

  /**
   * Required for backward compatibility with Medusa's PaymentProviderService
   * which calls provider.withTransaction() even for new payment processors
   */
  withTransaction(): this {
    console.log(`[PayPal] withTransaction called - this instanceof AbstractPaymentProcessor: ${this instanceof AbstractPaymentProcessor}`)
    return this
  }

  /**
   * Backward compatibility adapters - Medusa's PaymentProviderService uses old method names
   * These map the old API to the new AbstractPaymentProcessor interface
   */
  async createPayment(cart: Record<string, unknown>): Promise<Record<string, unknown>> {
    // This method should ONLY be called if Medusa doesn't recognize us as AbstractPaymentProcessor
    console.log(`[PayPal] createPayment called - this means instanceof AbstractPaymentProcessor check failed!`)
    console.log(`[PayPal] createPayment called with keys: ${Object.keys(cart).join(', ')}`)
    console.log(`[PayPal] cart.id=${cart.id}, cart.currency_code=${cart.currency_code}, cart.total=${cart.total}`)
    console.log(`[PayPal] cart.amount=${cart.amount}, cart.resource_id=${cart.resource_id}`)
    console.log(`[PayPal] cart.region?.currency_code=${(cart.region as { currency_code?: string })?.currency_code}`)
    
    try {
      // Medusa may pass a PaymentProcessorContext directly (with amount, currency_code, resource_id)
      // or a cart object (with total, region.currency_code, id)
      const isContext = cart.amount !== undefined && cart.currency_code !== undefined
      
      const context: PaymentProcessorContext = isContext ? {
        currency_code: cart.currency_code as string,
        amount: cart.amount as number,
        resource_id: cart.resource_id as string,
        customer: cart.customer as PaymentProcessorContext["customer"],
        context: cart.context as Record<string, unknown>,
        email: cart.email as string,
        billing_address: cart.billing_address as PaymentProcessorContext["billing_address"],
        paymentSessionData: {},
      } : {
        currency_code: (cart.currency_code || (cart.region as { currency_code?: string })?.currency_code) as string,
        amount: (cart.total ?? cart.payment_amount) as number,
        resource_id: cart.id as string,
        customer: cart.customer as PaymentProcessorContext["customer"],
        context: cart.context as Record<string, unknown>,
        email: cart.email as string,
        billing_address: cart.billing_address as PaymentProcessorContext["billing_address"],
        paymentSessionData: {},
      }
      
      console.log(`[PayPal] createPayment built context: currency=${context.currency_code}, amount=${context.amount}, resource_id=${context.resource_id}`)
      
      const result = await this.initiatePayment(context)
      console.log(`[PayPal] createPayment got result from initiatePayment:`, JSON.stringify(result))
      
      if (isPaymentProcessorError(result)) {
        console.error(`[PayPal] createPayment: initiatePayment returned error:`, result.error)
        throw new Error(result.error)
      }
      
      // Legacy API expects wrapped { session_data } format for proper extraction
      // This ensures Medusa's sessionData = paymentResponse.session_data ?? paymentResponse works
      const sessionData = (result as PaymentProcessorSessionResponse).session_data
      console.log(`[PayPal] createPayment returning { session_data } with id: ${sessionData?.id}`)
      return { session_data: sessionData }
    } catch (error) {
      console.error(`[PayPal] createPayment error:`, error)
      throw error
    }
  }

  async getPaymentData(paymentSessionData: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.retrievePayment(paymentSessionData)
    if (isPaymentProcessorError(result)) {
      throw new Error(result.error)
    }
    return result as Record<string, unknown>
  }

  // Backward compat alias for getPaymentStatus
  async getStatus(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentSessionStatus> {
    return this.getPaymentStatus(paymentSessionData)
  }

  async getPaymentStatus(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentSessionStatus> {
    const order = (await this.retrievePayment(
      paymentSessionData
    )) as PaypalOrder

    switch (order.status) {
      case PaypalOrderStatus.CREATED:
        return PaymentSessionStatus.PENDING
      case PaypalOrderStatus.SAVED:
      case PaypalOrderStatus.APPROVED:
      case PaypalOrderStatus.PAYER_ACTION_REQUIRED:
        return PaymentSessionStatus.REQUIRES_MORE
      case PaypalOrderStatus.VOIDED:
        return PaymentSessionStatus.CANCELED
      case PaypalOrderStatus.COMPLETED:
        return PaymentSessionStatus.AUTHORIZED
      default:
        return PaymentSessionStatus.PENDING
    }
  }

  async initiatePayment(
    context: PaymentProcessorContext
  ): Promise<PaymentProcessorError | PaymentProcessorSessionResponse> {
    console.log("[PayPal] initiatePayment called")
    const { currency_code, amount, resource_id } = context
    
    // Check if already a PayPal order (session refresh case)
    const contextAsAny = context as Record<string, unknown>
    if (contextAsAny.id && contextAsAny.links && contextAsAny.status) {
      console.log("[PayPal] initiatePayment called with existing PayPal order, returning as-is")
      return {
        session_data: context as unknown as Record<string, unknown>,
      }
    }

    // Ensure currency_code is defined
    if (!currency_code) {
      console.error("[PayPal] ERROR: currency_code is undefined! Context:", context)
      return this.buildError("currency_code is required", new Error("Missing currency_code in payment context"))
    }

    let session_data

    try {
      const intent: CreateOrder["intent"] = this.options_.capture
        ? "CAPTURE"
        : "AUTHORIZE"

      session_data = await this.paypal_.createOrder({
        intent,
        purchase_units: [
          {
            reference_id: resource_id,
            custom_id: resource_id,
            amount: {
              currency_code: currency_code.toUpperCase(),
              value: roundToTwo(
                humanizeAmount(amount, currency_code),
                currency_code
              ),
            },
          },
        ],
      })
      
      console.log(`[PayPal] Order created successfully: id=${session_data?.id}, status=${session_data?.status}`)
    } catch (e) {
      this.logger_?.error("PayPal createOrder failed:", e.response?.data || e.message)
      return this.buildError("An error occurred in initiatePayment", e)
    }

    return {
      session_data,
    }
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<
    | PaymentProcessorError
    | {
        status: PaymentSessionStatus
        data: PaymentProcessorSessionResponse["session_data"]
      }
  > {
    console.log(`[PayPal] authorizePayment called with data:`, JSON.stringify(paymentSessionData))
    
    try {
      // CRITICAL: Check if paymentSessionData is a PaymentSession object (has provider_id, cart_id, etc.)
      // If so, extract the actual PayPal order from the 'data' field
      let paypalOrderData = paymentSessionData
      if (paymentSessionData?.provider_id === 'paypal' && paymentSessionData?.data) {
        console.log(`[PayPal] authorizePayment: Extracting PayPal order from PaymentSession.data`)
        paypalOrderData = paymentSessionData.data as Record<string, unknown>
      }
      
      // Check if paypalOrderData has a valid PayPal order ID
      const orderId = paypalOrderData?.id as string | undefined
      
      if (!orderId) {
        console.log(`[PayPal] authorizePayment: No order ID in session data, checking if data itself is a PayPal order`)
        // Check if paypalOrderData IS the PayPal order
        if (paypalOrderData?.status && paypalOrderData?.purchase_units) {
          console.log(`[PayPal] authorizePayment: Data is already a PayPal order`)
          const order = paypalOrderData as unknown as PaypalOrder
          const stat = this.mapPaypalStatusToMedusa(order.status as string)
          return { data: order, status: stat }
        }
        
        console.error(`[PayPal] authorizePayment: Cannot authorize - no PayPal order ID`)
        return this.buildError("Cannot authorize payment", new Error("PayPal order ID not found in session data"))
      }
      
      // If we have the complete order data already (status COMPLETED with captures), use it directly
      if (paypalOrderData?.status === 'COMPLETED' && paypalOrderData?.purchase_units) {
        console.log(`[PayPal] authorizePayment: Order already COMPLETED, using existing data`)
        const order = paypalOrderData as unknown as PaypalOrder
        const stat = this.mapPaypalStatusToMedusa(order.status as string)
        return { data: order, status: stat }
      }
      
      // Otherwise fetch fresh data from PayPal
      console.log(`[PayPal] authorizePayment: Fetching fresh order data from PayPal for order ${orderId}`)
      const stat = await this.getPaymentStatus(paypalOrderData)
      const order = (await this.retrievePayment(
        paypalOrderData
      )) as PaypalOrder
      return { data: order, status: stat }
    } catch (error) {
      return this.buildError("An error occurred in authorizePayment", error)
    }
  }

  private mapPaypalStatusToMedusa(status: string): PaymentSessionStatus {
    switch (status) {
      case PaypalOrderStatus.CREATED:
        return PaymentSessionStatus.PENDING
      case PaypalOrderStatus.SAVED:
      case PaypalOrderStatus.APPROVED:
      case PaypalOrderStatus.PAYER_ACTION_REQUIRED:
        return PaymentSessionStatus.REQUIRES_MORE
      case PaypalOrderStatus.VOIDED:
        return PaymentSessionStatus.CANCELED
      case PaypalOrderStatus.COMPLETED:
        return PaymentSessionStatus.AUTHORIZED
      default:
        return PaymentSessionStatus.PENDING
    }
  }

  async cancelPayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<
    PaymentProcessorError | PaymentProcessorSessionResponse["session_data"]
  > {
    const order = (await this.retrievePayment(
      paymentSessionData
    )) as PaypalOrder

    const isAlreadyCanceled = order.status === PaypalOrderStatus.VOIDED
    const isCanceledAndFullyRefund =
      order.status === PaypalOrderStatus.COMPLETED && !!order.invoice_id

    if (isAlreadyCanceled || isCanceledAndFullyRefund) {
      return order
    }

    try {
      const { purchase_units } = paymentSessionData as {
        purchase_units: PurchaseUnits
      }
      const isAlreadyCaptured = purchase_units.some(
        (pu) => pu.payments.captures?.length
      )

      if (isAlreadyCaptured) {
        const payments = purchase_units[0].payments

        const payId = payments.captures[0].id
        await this.paypal_.refundPayment(payId)
      } else {
        const id = purchase_units[0].payments.authorizations[0].id
        await this.paypal_.cancelAuthorizedPayment(id)
      }

      return (await this.retrievePayment(
        paymentSessionData
      )) as unknown as PaymentProcessorSessionResponse["session_data"]
    } catch (error) {
      return this.buildError("An error occurred in cancelPayment", error)
    }
  }

  async capturePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<
    PaymentProcessorError | PaymentProcessorSessionResponse["session_data"]
  > {
    // Check if paymentSessionData is a PaymentSession wrapper
    let paypalOrderData = paymentSessionData
    if (paymentSessionData?.provider_id === 'paypal' && paymentSessionData?.data) {
      console.log(`[PayPal] capturePayment: Extracting PayPal order from PaymentSession.data`)
      paypalOrderData = paymentSessionData.data as Record<string, unknown>
    }
    
    const { purchase_units } = paypalOrderData as {
      purchase_units: PurchaseUnits
    }

    // Check if already captured (capture mode - payment was captured by PayPal automatically)
    const existingCaptures = purchase_units?.[0]?.payments?.captures
    if (existingCaptures?.length > 0 && existingCaptures[0].status === "COMPLETED") {
      console.log("Payment already captured in PayPal, skipping capture")
      return await this.retrievePayment(paypalOrderData)
    }

    // For authorization mode - capture the authorized payment
    const authorizations = purchase_units?.[0]?.payments?.authorizations
    if (!authorizations?.length) {
      // If no authorizations and no captures, return current data
      console.log("No authorizations found, returning current payment data")
      return await this.retrievePayment(paypalOrderData)
    }

    const id = authorizations[0].id

    try {
      await this.paypal_.captureAuthorizedPayment(id)
      return await this.retrievePayment(paypalOrderData)
    } catch (error) {
      return this.buildError("An error occurred in capturePayment", error)
    }
  }

  /**
   * Paypal does not provide such feature
   * @param paymentSessionData
   */
  async deletePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<
    PaymentProcessorError | PaymentProcessorSessionResponse["session_data"]
  > {
    return paymentSessionData
  }

  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number
  ): Promise<
    PaymentProcessorError | PaymentProcessorSessionResponse["session_data"]
  > {
    const { purchase_units } = paymentSessionData as {
      purchase_units: PurchaseUnits
    }

    try {
      const purchaseUnit = purchase_units[0]
      const payments = purchaseUnit.payments
      const isAlreadyCaptured = purchase_units.some(
        (pu) => pu.payments.captures?.length
      )

      if (!isAlreadyCaptured) {
        throw new Error("Cannot refund an uncaptured payment")
      }

      const paymentId = payments.captures[0].id
      const currencyCode = purchaseUnit.amount.currency_code
      await this.paypal_.refundPayment(paymentId, {
        amount: {
          currency_code: currencyCode,
          value: roundToTwo(
            humanizeAmount(refundAmount, currencyCode),
            currencyCode
          ),
        },
      })

      return await this.retrievePayment(paymentSessionData)
    } catch (error) {
      return this.buildError("An error occurred in refundPayment", error)
    }
  }

  async retrievePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<
    PaymentProcessorError | PaymentProcessorSessionResponse["session_data"]
  > {
    try {
      // Check if paymentSessionData is a PaymentSession wrapper
      let paypalOrderData = paymentSessionData
      if (paymentSessionData?.provider_id === 'paypal' && paymentSessionData?.data) {
        console.log(`[PayPal] retrievePayment: Extracting PayPal order from PaymentSession.data`)
        paypalOrderData = paymentSessionData.data as Record<string, unknown>
      }
      
      // If already have complete order data with purchase_units, return it directly
      if (paypalOrderData?.status && paypalOrderData?.purchase_units) {
        console.log(`[PayPal] retrievePayment: Already have complete order data, returning as-is`)
        return paypalOrderData as unknown as PaymentProcessorSessionResponse["session_data"]
      }
      
      const id = paypalOrderData.id as string
      return (await this.paypal_.getOrder(
        id
      )) as unknown as PaymentProcessorSessionResponse["session_data"]
    } catch (e) {
      return this.buildError("An error occurred in retrievePayment", e)
    }
  }

  async updatePayment(
    context: PaymentProcessorContext
  ): Promise<PaymentProcessorError | PaymentProcessorSessionResponse | void> {
    console.log(`[PayPal] updatePayment FULL CONTEXT:`, JSON.stringify(context, null, 2))
    
    // CRITICAL FIX: Check if context itself IS the PayPal order (Medusa passes it directly)
    const contextAsAny = context as any
    if (contextAsAny.id && contextAsAny.links && contextAsAny.status) {
      console.log(`[PayPal] updatePayment: Context IS the PayPal order directly, returning as-is`)
      return { session_data: context as unknown as Record<string, unknown> }
    }
    
    const { currency_code, amount, resource_id } = context
    const id = context.paymentSessionData?.id as string | undefined

    console.log(`[PayPal] updatePayment called - id=${id}, currency_code=${currency_code}, amount=${amount}`)
    console.log(`[PayPal] updatePayment context.paymentSessionData:`, context.paymentSessionData ? 'exists' : 'undefined')

    // If no order ID or currency_code is missing, just return the existing session data
    // Don't try to create a new payment - the session data might have been set via webhook
    if (!id || !currency_code) {
      console.log(`[PayPal] updatePayment: Missing id (${id}) or currency_code (${currency_code}), returning existing session`)
      return { session_data: context.paymentSessionData || {} }
    }

    try {

      // Retrieve existing order to check status and get actual reference_id
      let existingOrder
      try {
        existingOrder = await this.paypal_.getOrder(id)
      } catch (error: unknown) {
        // If order doesn't exist (expired, already processed, etc.), just return existing session
        const errorWithResponse = error as { response?: { data?: { name?: string } } }
        if (errorWithResponse?.response?.data?.name === 'RESOURCE_NOT_FOUND') {
          console.log(`updatePayment: PayPal order ${id} not found, returning existing session`)
          return { session_data: context.paymentSessionData }
        }
        throw error
      }
      
      console.log(`updatePayment: Order ${id} status: ${existingOrder.status}`)
      
      // Check if order is already completed (can't update completed orders)
      if (existingOrder.status === PaypalOrderStatus.COMPLETED) {
        console.log("Order already completed, skipping update")
        return { session_data: context.paymentSessionData }
      }

      // Use the actual reference_id from the order, not the context
      const actualReferenceId = existingOrder.purchase_units?.[0]?.reference_id || "default"
      
      console.log(`updatePayment: Using reference_id '${actualReferenceId}' (context had '${resource_id}')`)

      await this.paypal_.patchOrder(id, [
        {
          op: "replace",
          path: `/purchase_units/@reference_id=='${actualReferenceId}'`,
          value: {
            reference_id: resource_id,
            custom_id: resource_id,
            amount: {
              currency_code: currency_code.toUpperCase(),
              value: roundToTwo(
                humanizeAmount(amount, currency_code),
                currency_code
              ),
            },
          },
        },
      ])
      return { session_data: context.paymentSessionData }
    } catch (error) {
      return await this.initiatePayment(context).catch((e) => {
        return this.buildError("An error occurred in updatePayment", e)
      })
    }
  }

  async updatePaymentData(sessionId: string, data: Record<string, unknown>) {
    try {
      // Prevent from updating the amount from here as it should go through
      // the updatePayment method to perform the correct logic
      if (data.amount) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Cannot update amount, use updatePayment instead"
        )
      }

      return data
    } catch (e) {
      return this.buildError("An error occurred in updatePaymentData", e)
    }
  }

  async retrieveOrderFromAuth(authorization) {
    const link = authorization.links.find((l) => l.rel === "up")
    const parts = link.href.split("/")
    const orderId = parts[parts.length - 1]

    if (!orderId) {
      return null
    }

    return await this.paypal_.getOrder(orderId)
  }

  async retrieveOrderFromCapture(capture) {
    const link = capture.links.find((l) => l.rel === "up")
    const parts = link.href.split("/")
    const orderId = parts[parts.length - 1]

    if (!orderId) {
      return null
    }

    return await this.paypal_.getOrder(orderId)
  }

  async retrieveAuthorization(id) {
    return await this.paypal_.getAuthorizationPayment(id)
  }

  async retrieveCapture(id) {
    return await this.paypal_.getCapturePayment(id)
  }

  protected buildError(
    message: string,
    e: PaymentProcessorError | Error
  ): PaymentProcessorError {
    return {
      error: message,
      code: "code" in e ? e.code : "",
      detail: isPaymentProcessorError(e)
        ? `${e.error}${EOL}${e.detail ?? ""}`
        : e.message ?? "",
    }
  }

  /**
   * Checks if a webhook is verified.
   * @param {object} data - the verficiation data.
   * @returns {Promise<object>} the response of the verification request.
   */
  async verifyWebhook(data) {
    return await this.paypal_.verifyWebhook({
      webhook_id: this.options_.auth_webhook_id || this.options_.authWebhookId,
      ...data,
    })
  }
}

export default PayPalProviderService
