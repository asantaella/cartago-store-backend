import { LineItem, Order } from "@medusajs/medusa";
import { AsyncParser } from "@json2csv/node";
import { BaseService } from "medusa-interfaces";

import { formatMoney, formatDate } from "../utils/format-utils";
import { OrderInvoice } from "../types/order-invoice.model";

class OrderCsvAttachmentService extends BaseService {
  async buildCSVAttachment(order: Order): Promise<string> {
    const orderInvoice = new OrderInvoice(order);
    const itemFields = [
      { label: "title", value: "variant.title" },
      { label: "sku", value: "variant.sku" },
      { label: "quantity", value: "quantity" },
      { label: "unit_price_ex_tax", value: "unit_price_ex_tax" },
      { label: "unit_price", value: "unit_price" },
      { label: "subtotal", value: "totals.subtotal" },
      { label: "discount_total", value: "totals.discount_total" },
      { label: "total", value: "totals.total" },
      { label: "ref", value: "variant.barcode" },
    ];

    const customer = [
      {
        customer:
          orderInvoice.getBillingCompanyName() ||
          orderInvoice.getCustomerName().toLocaleUpperCase(),
      },
      {
        customer: orderInvoice.getBillingAddress().toLocaleUpperCase(),
      },
      {
        customer:
          `${orderInvoice.getBillingPostalCode()} ${orderInvoice.getBillingCityCountry()}`.toLocaleUpperCase(),
      },
      {
        customer: `${orderInvoice.getCustomerNifCif()}`,
      },
      {
        customer: formatDate(order.created_at),
      },
    ];
    const currencyCode = order.currency_code?.toUpperCase();
    const customerFields = [{ label: "customer", value: "customer" }];

    const itemParser = new AsyncParser({
      fields: itemFields,
      delimiter: ";",
    });
    const customerParser = new AsyncParser({
      fields: customerFields,
      delimiter: ";",
    });

    const orderItems = order.items.map((item: LineItem) => ({
      ...item,
      unit_price_ex_tax: formatMoney(
        item.subtotal / item.quantity,
        currencyCode,
      ),
      unit_price: formatMoney(item.total / item.quantity, currencyCode),
      totals: {
        subtotal: formatMoney(item.subtotal, currencyCode),
        discount_total: formatMoney(item.discount_total, currencyCode),
        total: formatMoney(item.total, currencyCode),
      },
    }));

    const itemsCsv = await itemParser.parse(orderItems).promise();
    const customerCsv = await customerParser.parse(customer).promise();
    const shippingMethodCsv = orderInvoice.buildShippingMethodCsv();
    const csvContent = `${customerCsv}\n\n${itemsCsv}\n${shippingMethodCsv}`;

    return Buffer.from(csvContent.replace(/ €/g, "")).toString("base64");
  }
}

export default OrderCsvAttachmentService;