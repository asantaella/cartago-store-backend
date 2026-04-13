import { Fulfillment, LineItem, Order, TrackingLink } from "@medusajs/medusa";
import { formatMoney, formatDate, formatAddress } from "../utils/format-utils";
import { OrderInvoice } from "../types/order-invoice.model";
import OrderNotificationBase from "./order-notification-base";

export interface ShipmentNotificationTemplateMetadata {
  to_email: string;
  from_email: string;
  to_name: string;
  template_id: string;
  data?: ShipmentNotificationTemplateData;
}

export interface ShipmentNotificationTemplateData {
  company_name: string;
  display_id: number;
  first_name?: string;
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
  showTrackingDeliverySection?: boolean;
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
}

class ShipmentTemplateNotificationService extends OrderNotificationBase {
  constructor(container) {
    super(container);
  }

  getShipmentTemplateData(
    event: string,
    order: Order,
    fulfillment?: Fulfillment,
  ): ShipmentNotificationTemplateMetadata {
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

    if (!templateId && event !== "shipment.created") {
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

    const fulfillments = Array.isArray(order.fulfillments)
      ? order.fulfillments
      : fulfillment
        ? [fulfillment]
        : [];

    const trackingLinks = fulfillments.flatMap((ff) => {
      const trackingLinksForFulfillment = Array.isArray(ff.tracking_links)
        ? ff.tracking_links
        : [];

      return trackingLinksForFulfillment.map((tl) => ({
        ...tl,
        url:
          (ff?.metadata?.delivery as string) ||
          `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number=${tl.tracking_number}` ||
          "https://www.correos.es/es/es/herramientas/localizador/envios",
      }));
    });

    let taxRate = order.items[0]?.tax_lines[0]?.rate;
    taxRate = typeof taxRate === "number" ? taxRate : order.region?.tax_rate;

    return {
      to_email: order.email,
      from_email: this.config.sender_email,
      to_name: `${order.shipping_address?.first_name} ${order.shipping_address?.last_name}`,
      template_id: templateId,
      data: {
        company_name: this.config.company_name,
        display_id: order?.display_id,
        first_name: order.shipping_address?.first_name,
        order_date: formatDate(order.created_at || new Date()),
        shipment_date: formatDate(
          fulfillment?.shipped_at || fulfillment?.created_at || new Date(),
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
        shipping_method:
          invoiceOrder.getShippingMethodName() ||
          order.shipping_methods?.[0]?.shipping_option?.name ||
          (fulfillment as any)?.shipping_method ||
          "",
        shipping_total: formatMoney(
          invoiceOrder.getShipping() || 0,
          currencyCode,
        ),
        currency: currencyCode,
        subtotal_ex_tax: formatMoney(order.subtotal, currencyCode),
        subtotal: formatMoney(
          order.subtotal + order.tax_total || 0,
          currencyCode,
        ),
        tax_total: formatMoney(invoiceOrder.getTaxes() || 0, currencyCode),
        tax_rate: taxRate,
        discount_total: formatMoney(
          invoiceOrder.getDiscount() || 0,
          currencyCode,
        ),
        total: formatMoney(invoiceOrder.getTotal(), currencyCode),
        items: formattedItems,
        showTrackingDeliverySection: true,
      },
    };
  }
}

export default ShipmentTemplateNotificationService;
