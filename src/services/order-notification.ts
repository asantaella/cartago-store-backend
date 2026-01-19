import {
  Address,
  LineItem,
  Order,
  OrderService,
  Fulfillment,
  TrackingLink,
} from "@medusajs/medusa";
import { formatMoney, formatDate, formatAddress } from "../utils/format-utils";
import { OrderInvoice } from "../types/order-invoice.model";
import { isNumber } from "util";

interface MailerSendOrderPlacedNotification {
  to_email: string;
  from_email: string;
  to_name: string;
  // template_id: string;
  data?: MailerSendOrderData;
}

interface MailerSendOrderData {
  company_name: string;
  display_id: number;
  order_date: string;
  customer: {
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone?: string;
    nif_cif?: string;
  };
  shipping_address: string;
  billing_address?: string;
  customer_company_name?: string;
  shipping_method: string;
  shipping_total: string;
  currency: string;
  subtotal_ex_tax: string;
  subtotal: string;
  tax_total: string;
  tax_rate?: number;
  total: string;
  items: Array<{
    title: string;
    quantity: number;
    variant: string;
    price: string;
    ref: string;
    sku?: string;
    unit_price_ex_tax: string;
    unit_price: string;
    totals: {
      tax_total: string;
      discount_total: string;
      subtotal: string;
      total: string;
    };
  }>;
  discount_total?: string;
  order_url?: string;
}

class OrderNotificationService {
  protected orderService: OrderService;
  protected config: any;

  constructor(container) {
    this.orderService = container.orderService;

    // Inicializar la configuración
    this.config = {
      order_placed_url: process.env.MAILERSEND_ORDER_PLACED_URL,
      support_url: process.env.MAILERSEND_SUPPORT_URL,
      account_name: process.env.MAILERSEND_SENDER_NAME,
      company_name: process.env.MAILERSEND_COMPANY_NAME,
      sender_name: process.env.MAILERSEND_SENDER_NAME,
      sender_email: process.env.MAILERSEND_SENDER_EMAIL,
      sender_address: process.env.MAILERSEND_SENDER_ADDRESS,
      admin_email: process.env.MAILERSEND_ADMIN_EMAIL,
    };
  }

  get senderEmail(): string {
    return this.config.sender_email || "equipo@cartago4x4.com";
  }

  get senderName(): string {
    return this.config.sender_name || "Cartago4x4";
  }

  getTemplateData(order: Order): MailerSendOrderPlacedNotification {
    if (!order || typeof order !== "object") {
      return {
        to_email: "",
        from_email: "",
        to_name: "",
        data: undefined,
      };
    }
    const invoiceOrder = new OrderInvoice(order);

    const currencyCode = order.currency_code?.toUpperCase();

    const formattedItems =
      order.items?.map((item: LineItem) => ({
        title: item.title,
        quantity: item.quantity,
        variant: item.variant?.title || "",
        price: formatMoney(item.unit_price * item.quantity, currencyCode),
        ref: item.variant.barcode || "S/N",
        sku: item.variant ? item.variant.sku : undefined,
        unit_price_ex_tax: formatMoney(
          item.subtotal / item.quantity,
          currencyCode
        ),
        unit_price: formatMoney(item.total / item.quantity, currencyCode),
        totals: {
          tax_total: formatMoney(item.tax_total, currencyCode),
          discount_total: formatMoney(item.discount_total, currencyCode),
          subtotal: formatMoney(item.subtotal, currencyCode),
          total: formatMoney(item.total, currencyCode),
        },
      })) || [];

    let taxRate = order.items[0]?.tax_lines[0]?.rate;

    taxRate = typeof taxRate === "number" ? taxRate : order.region?.tax_rate;

    return {
      to_email: order.email,
      from_email: this.config.sender_email,
      to_name: `${order.shipping_address?.first_name} ${order.shipping_address?.last_name}`,
      data: {
        company_name: this.config.company_name,
        display_id: order?.display_id,
        order_date: formatDate(order.created_at),
        customer: {
          first_name: order.shipping_address?.first_name,
          last_name: order.shipping_address?.last_name,
          full_name: `${order.shipping_address?.first_name} ${order.shipping_address?.last_name}`,
          email: order.email,
          phone: order.shipping_address?.phone,
          nif_cif: invoiceOrder.getCustomerNifCif(),
        },
        shipping_address: formatAddress(order.shipping_address),
        billing_address: formatAddress(order.billing_address),
        customer_company_name: invoiceOrder.getBillingCompanyName(),
        shipping_method: invoiceOrder.getShippingMethodName(),
        shipping_total: formatMoney(order.shipping_total, currencyCode),

        currency: currencyCode,
        subtotal_ex_tax: formatMoney(order.subtotal, currencyCode),
        subtotal: formatMoney(
          order.subtotal + order.tax_total || 0,
          currencyCode
        ),
        tax_total: formatMoney(
          invoiceOrder.getTaxes() || 0,
          currencyCode,
          false
        ),
        tax_rate: taxRate,
        discount_total: formatMoney(
          invoiceOrder.getDiscount() || 0,
          currencyCode,
          false
        ),
        total: formatMoney(invoiceOrder.getTotal() || 0, currencyCode, false),
        items: formattedItems,

        // URL para ver el pedido (si existe)
        order_url: this.config.order_placed_url
          ? `${this.config.order_placed_url}?id=${order.id}`
          : undefined,
      },
    };
  }

  async retrieveOrderWithRelations(
    orderId: string,
    relations: string[] = []
  ): Promise<Order> {
    return await this.orderService.retrieveWithTotals(orderId, {
      relations: [
        "shipping_address",
        "billing_address",
        "items",
        "items.variant",
        "items.variant.product",
        "shipping_methods",
        "shipping_methods.shipping_option",
        "shipping_methods.tax_lines",
        "discounts",
        "region",
        "currency",
        ...relations,
      ] 
    });
  }

  getShipmentTemplateData(
    event: string,
    order: Order,
    fulfillment?: Fulfillment
  ): MailerSendShipmentNotification {
    if (!order || typeof order !== "object") {
      return {
        to_email: "",
        from_email: "",
        to_name: "",
        template_id: "",
        data: undefined,
      };
    }
    const invoiceOrder = new OrderInvoice(order);
    const templateId = this.config?.template_overrides?.[event];
    const currencyCode = order.currency_code?.toUpperCase();

    if (!templateId) {
      console.warn(`[NOTIFICATION] No template ID found for event: ${event}`);
    }

    const formattedItems =
      order.items?.map((item: LineItem) => ({
        title: item.title,
        quantity: item.quantity,
        variant: item.variant?.title || "",
        price: formatMoney(item.unit_price * item.quantity, currencyCode),
        ref: item.variant.barcode || "S/N",
        sku: item.variant ? item.variant.sku : undefined,
        unit_price_ex_tax: formatMoney(
          item.subtotal / item.quantity,
          currencyCode
        ),
        unit_price: formatMoney(item.total / item.quantity, currencyCode),
        totals: {
          tax_total: formatMoney(item.tax_total, currencyCode),
          discount_total: formatMoney(item.discount_total, currencyCode),
          subtotal: formatMoney(item.subtotal, currencyCode),
          total: formatMoney(item.total, currencyCode),
        },
      })) || [];
    const trackingLinks =
      order?.fulfillments.flatMap((ff) =>
        ff.tracking_links.map((tl) => ({
          ...tl,
          url:
            (ff?.metadata?.delivery as string) ||
            `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number=${tl.tracking_number}` ||
            "https://www.correos.es/es/es/herramientas/localizador/envios",
        }))
      ) || [];

    let taxRate = order.items[0]?.tax_lines[0]?.rate;

    taxRate = typeof taxRate === "number" ? taxRate : order.region?.tax_rate;

    console.log(
      `\n\n[OrderNotificationService] [getShipmentTemplateData] Event: ${taxRate}\n\n`
    );

    return {
      to_email: order.email,
      from_email: this.config.sender_email,
      to_name: `${order.shipping_address?.first_name} ${order.shipping_address?.last_name}`,
      template_id: templateId,
      data: {
        company_name: this.config.company_name,
        display_id: order?.display_id,
        order_date: formatDate(order.created_at || new Date()),
        shipment_date: formatDate(
          fulfillment?.shipped_at || fulfillment?.created_at || new Date()
        ),
        tracking_links: trackingLinks,
        customer: {
          first_name: order.shipping_address?.first_name,
          last_name: order.shipping_address?.last_name,
          full_name: `${order.shipping_address?.first_name} ${order.shipping_address?.last_name}`,
          email: order.email,
          phone: order.shipping_address?.phone,
          nif_cif: invoiceOrder.getCustomerNifCif(),
        },
        shipping_address: formatAddress(order.shipping_address),
        billing_address: formatAddress(order.billing_address),
        customer_company_name: invoiceOrder.getBillingCompanyName(),
        shipping_method: invoiceOrder.getShippingMethodName(),
        shipping_total: formatMoney(
          invoiceOrder.getShipping() || 0,
          currencyCode
        ),
        currency: currencyCode,
        subtotal_ex_tax: formatMoney(order.subtotal, currencyCode),
        subtotal: formatMoney(
          order.subtotal + order.tax_total || 0,
          currencyCode
        ),
        tax_total: formatMoney(invoiceOrder.getTaxes() || 0, currencyCode),
        tax_rate: taxRate,
        discount_total: formatMoney(
          invoiceOrder.getDiscount() || 0,
          currencyCode
        ),
        total: formatMoney(invoiceOrder.getTotal(), currencyCode),
        items: formattedItems,
      },
    };
  }
}

interface MailerSendShipmentNotification {
  to_email: string;
  from_email: string;
  to_name: string;
  template_id: string;
  data?: MailerSendShipmentData;
}

interface MailerSendShipmentData {
  company_name: string;
  display_id: number;
  order_date: string;
  shipment_date: string;
  tracking_links?: Pick<TrackingLink, "tracking_number" | "url">[];
  customer: {
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone?: string;
    nif_cif?: string;
  };
  shipping_address: string;
  billing_address?: string;
  customer_company_name?: string;
  shipping_method: string;
  shipping_total: string;
  currency: string;
  subtotal_ex_tax: string;
  subtotal: string;
  tax_total: string;
  tax_rate?: number;
  total: string;
  items: Array<{
    title: string;
    quantity: number;
    variant: string;
    price: string;
    ref: string;
    sku?: string;
    unit_price_ex_tax: string;
    unit_price: string;
    totals: {
      tax_total: string;
      discount_total: string;
      subtotal: string;
      total: string;
    };
  }>;
  discount_total?: string;
  order_url?: string;
}

export default OrderNotificationService;
export {
  MailerSendOrderPlacedNotification,
  MailerSendOrderData,
  MailerSendShipmentNotification,
  MailerSendShipmentData,
};
