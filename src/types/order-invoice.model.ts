import { Order } from "@medusajs/medusa";
import { formatMoney } from "../utils/format-utils";

export type InvoiceMode = "invoice" | "receipt";
export class OrderInvoice {
  private readonly order: Order;

  private readonly countryLabel: Record<string, string> = {
    ES: "España",
    FR: "Francia",
    IT: "Italia",
    DE: "Alemania",
    PT: "Portugal",
  };

  constructor(order: Order) {
    this.order = Object.assign({}, { ...order }) as Order;
  }

  /**
   * Obtiene el NIF/CIF del cliente
   */
  public getCustomerNifCif(): string | undefined {
    if (!this.order) return undefined;

    return (
      (this.order?.shipping_address?.metadata?.nif_cif as string) ||
      (this.order?.billing_address?.metadata?.nif_cif as string) ||
      "-"
    );
  }

  /**
   * Obtiene el nombre del método de envío
   */
  public getShippingMethodName(): string {
    if (!this.order || !this.order.shipping_methods) return "";

    return this.order.shipping_methods.length
      ? this.order.shipping_methods[0].shipping_option?.name || ""
      : "";
  }

  /**
   * Construye una fila CSV para el método de envío
   */
  public buildShippingMethodCsv(): string {
    if (
      !this.order ||
      !this.order.shipping_methods ||
      !this.order.shipping_methods.length
    ) {
      return ";;;;;;;;";
    }
    const currencyCode = this.order.currency_code || "EUR";
    const taxRate = this.getTaxRate();

    const shippingMethod = this.order.shipping_methods[0];
    const shippingMethodName = shippingMethod?.shipping_option?.name || "";
    const shippingTotal = formatMoney(shippingMethod?.price || 0, currencyCode);
    const discountTotal = formatMoney(0, currencyCode);
    const shippingSubtotal = formatMoney(
      shippingMethod?.price / (1 + taxRate / 100) || 0,
      currencyCode
    );

    return `${shippingMethodName};;1;${shippingSubtotal};${shippingTotal};${shippingSubtotal};${discountTotal};${shippingTotal};;`;
  }

  /**
   * Calcula el total de impuestos de envío
   */
  public getShippingTaxTotal(): number {
    return this.order.shipping_methods.reduce((acc, method) => {
      return acc + (method.tax_total || 0);
    }, 0);
  }

  /**
   * Obtiene el nombre completo del cliente
   */
  public getCustomerName(): string {
    return `${this.order.shipping_address.first_name} ${this.order.shipping_address.last_name}`;
  }

  /**
   * Obtiene la dirección de facturación
   */
  public getBillingAddress(): string {
    return this.order.billing_address
      ? `${this.order.billing_address.address_1}${
          this.order.billing_address.address_2
            ? " " + this.order.billing_address.address_2
            : ""
        }`
      : `${this.order.shipping_address.address_1}${
          this.order.shipping_address.address_2
            ? " " + this.order.shipping_address.address_2
            : ""
        }`;
  }

  public getCustomerFullAddress(): string {
    return `${this.getBillingAddress()}\n${this.getBillingCityCountry()}`;
  }

  /**
   * Obtiene la etiqueta del país de facturación
   */
  public getBillingCountryLabel(): string {
    const countryCode = this.order.billing_address
      ? this.order.billing_address.country_code.toLocaleUpperCase()
      : this.order.shipping_address.country_code.toLocaleUpperCase();

    return this.countryLabel[countryCode];
  }

  /**
   * Obtiene la ciudad y país de facturación
   */
  public getBillingCityCountry(): string {
    return this.order.billing_address
      ? `${this.order.billing_address.city} (${
          this.order.billing_address.province
        }), ${this.getBillingCountryLabel()}`
      : `${this.order.shipping_address.city} (${
          this.order.shipping_address.province
        }), ${this.getBillingCountryLabel()}`;
  }

  /**
   * Obtiene el código postal de facturación
   */
  public getBillingPostalCode(): string {
    return this.order.billing_address
      ? `${this.order.billing_address.postal_code}`
      : `${this.order.shipping_address.postal_code}`;
  }

  /**
   * Obtiene el teléfono de facturación
   */
  public getBillingPhone(): string {
    return this.order.billing_address
      ? `${this.order.billing_address.phone}`
      : this.order.shipping_address.phone
      ? `${this.order.shipping_address.phone}`
      : `${this.order.customer.phone}`;
  }

  /**
   * Calcula el subtotal del pedido
   */
  public getSubtotal(): number {
    return this.order.subtotal / 100;
  }

  /**
   * Calcula los impuestos del pedido
   */
  public getTaxes(): number {
    return this.order.tax_total / 100;
  }

  /**
   * Obtiene la tasa de impuestos del pedido
   */
  public getTaxRate(): number {
    const taxRate = this.order.items[0]?.tax_lines[0]?.rate;
    return taxRate !== undefined && taxRate !== null ? taxRate : 21;
  }

  /**
   * Calcula el costo de envío incluyendo impuestos
   */
  public getShipping(): number {
    const shippingTaxTotal = this.getShippingTaxTotal();
    return (this.order.shipping_total + shippingTaxTotal) / 100;
  }

  /**
   * Calcula el descuento del pedido
   */
  public getDiscount(): number {
    return this.order.discounts.reduce((acc, discount) => {
      return acc + (discount.rule.value / 100) * this.getSubtotal();
    }, 0);
  }

  /**
   * Calcula el subtotal después de aplicar descuentos
   */
  public getSubtotalAfterDiscount(): number {
    return this.getSubtotal() - this.getDiscount();
  }

  /**
   * Obtiene la fecha de creación del pedido formateada
   */
  public getOrderCreatedAt(): string {
    return new Date(this.order.created_at).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  public getInvoiceCreatedAt(): string {
    if (this.order.fulfillments && this.order.fulfillments.length > 0) {
      const createdAt = this.order.created_at;
      return new Date(createdAt).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return this.getOrderCreatedAt();
  }

  public getInvoiceId(): string {
    return (
      (this.order.billing_address?.metadata?.invoice_id as string) ||
      (this.order.shipping_address?.metadata?.invoice_id as string) ||
      (this.order?.metadata?.invoice_number as string)
    );
  }

  /**
   * Crea una instancia de OrderInvoice a partir de una orden
   */
  public static fromOrder(order: Order): OrderInvoice {
    return new OrderInvoice(order);
  }
}
