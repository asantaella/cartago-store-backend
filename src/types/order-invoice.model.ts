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
    const shippingTotal = this.order.shipping_total;
    if (shippingTotal === 0) {
      return this.getItemsTaxes();
    }
    return this.order.tax_total / 100;
  }

  public getItemsTaxes(): number {
    const itemsTaxes = this.order.items.reduce(
      (acc, item) => acc + (item.tax_total || 0),
      0
    );
    return itemsTaxes / 100;
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
    return (this.order.shipping_total || 0) / 100;
  }

  /**
   * Calcula el costo de envío sin impuestos
   */
  public getShippingWithoutTax(): number {
    return (this.order.shipping_total || 0) / 100;
  }

  /**
   * Obtiene el impuesto de envío
   */
  public getShippingTax(): number {
    return this.calculateShippingTaxTotal() / 100;
  }

  /**
   * Calcula el impuesto de envío si no está disponible shipping_tax_total
   */
  private calculateShippingTaxTotal(): number {
    // Si shipping_tax_total está disponible, usarlo directamente
    if (
      this.order.shipping_tax_total !== undefined &&
      this.order.shipping_tax_total !== null
    ) {
      return this.order.shipping_tax_total;
    }

    // Si no está disponible, calcularlo a partir de los métodos de envío
    if (this.order.shipping_methods && this.order.shipping_methods.length > 0) {
      const taxRate = this.getTaxRate() / 100;
      const shippingMethod = this.order.shipping_methods[0];

      // Si el método de envío tiene tax_lines, calcular a partir de ellas
      if (shippingMethod.tax_lines && shippingMethod.tax_lines.length > 0) {
        return shippingMethod.tax_lines.reduce((acc, taxLine) => {
          return acc + (taxLine.rate / 100) * shippingMethod.price;
        }, 0);
      }

      // Si no hay tax_lines, usar la tasa de impuesto general
      return shippingMethod.price * taxRate;
    }

    return 0;
  }

  /**
   * Calcula el descuento del pedido
   */
  public getDiscount(): number {
    // Si hay discount_total disponible, usarlo
    if (
      this.order.discount_total !== undefined &&
      this.order.discount_total !== null
    ) {
      return this.order.discount_total / 100;
    }
  }

  /**
   * Calcula el subtotal después de aplicar descuentos
   */
  public getSubtotalAfterDiscount(): number {
    // Usar el subtotal - discount_total si está disponible
    if (
      this.order.discount_total !== undefined &&
      this.order.discount_total !== null
    ) {
      return this.getSubtotal() - this.order.discount_total / 100;
    }
    // Si no, calcularlo manualmente (backwards compatibility)
    return this.getSubtotal() - this.getDiscount();
  }

  /**
   * Calcula el total del pedido, corrigiendo el problema con los descuentos en gastos de envío
   */
  public getTotal(): number {
    // Calculamos el total corregido manualmente

    const shipping = this.getShippingWithoutTax();

    if (shipping > 0) {
      return this.order.total / 100;
    }
    const subtotal = this.getSubtotal();
    const taxes = this.getTaxes();
    const discount = this.getDiscount() || 0;
    //const shippingTax = this.getShippingTax();

    const total = subtotal + taxes - discount;

    return total;
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
