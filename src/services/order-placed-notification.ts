import { LineItem, Order } from "@medusajs/medusa";
import { formatMoney, formatDate, formatAddress } from "../utils/format-utils";
import { OrderInvoice } from "../types/order-invoice.model";
import OrderNotificationBase from "./order-notification-base";

export interface OrderPlacedNotificationTemplateMetadata {
  to_email: string;
  from_email: string;
  to_name: string;
  data?: OrderPlacedNotificationTemplateData;
}

export interface OrderPlacedNotificationTemplateData {
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
  payment_method_label?: string;
  payment_note?: string;
}

class OrderPlacedNotificationService extends OrderNotificationBase {
  constructor(container) {
    super(container);
  }

  getTemplateData(order: Order): OrderPlacedNotificationTemplateMetadata {
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
          currencyCode,
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
          currencyCode,
        ),
        tax_total: formatMoney(
          invoiceOrder.getTaxes() || 0,
          currencyCode,
          false,
        ),
        tax_rate: taxRate,
        discount_total: formatMoney(
          invoiceOrder.getDiscount() || 0,
          currencyCode,
          false,
        ),
        total: formatMoney(invoiceOrder.getTotal() || 0, currencyCode, false),
        items: formattedItems,
        order_url: this.config.order_placed_url
          ? `${this.config.order_placed_url}?id=${order.id}`
          : undefined,
      },
    };
  }
}

export default OrderPlacedNotificationService;
