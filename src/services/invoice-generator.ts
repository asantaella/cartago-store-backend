import { BaseService } from "medusa-interfaces";
import { LineItem, Order, OrderService } from "@medusajs/medusa";
import pdfmake from "pdfmake";
import Roboto from "../fonts/Roboto";
import LogoCartago from "../types/logo";
class InvoiceGeneratorService extends BaseService {
  static identifier = "invoice-generator";

  protected orderService: OrderService;

  constructor(container) {
    super(container);
    this.orderService = container.orderService;
  }

  private countryLabel = {
    ES: "España",
    FR: "Francia",
    IT: "Italia",
    DE: "Alemania",
    PT: "Portugal",
  };

  private businessInfoContent = [
    { text: "Dirección: ", bold: true },
    "Alameda San Antón 23 (Apdo. Correos 5085)\n",
    { text: "Ciudad, País: ", bold: true },
    "Cartagena, Murcia, España\n",
    { text: "Código Postal: ", bold: true },
    "30205\n",
    { text: "NIF/CIF: ", bold: true },
    "23036207-M\n",
    { text: "Mail: ", bold: true },
    "contacto@cartago4x4.es",
  ];

  /**
   * Fills the HTML template with order data.
   * @param {string} template - The HTML template string.
   * @param {object} order - The order data.
   * @returns {string} - The filled HTML.
   */
  fillTemplate(order) {
    // Implement your template filling logic here
    return `
      <tr>
        <td>${order.items
          .map(
            (item) => `
          <tr>
            <td>${item.title}</td>
            <td>${item.quantity}</td>
            <td>${item.unit_price / 100}</td>
          </tr>`
          )
          .join("")}
      </tr>`;
  }

  async generateInvoice(orderId) {
    // Fetch the order details using the order service
    const order: Order = await this.orderService.retrieve(orderId, {
      relations: [
        "items",
        "items.variant",
        "items.variant.product",
        "items.variant.product.categories",
        "customer",
        "shipping_address",
        "billing_address",
        "shipping_methods",
      ],
      select: ["subtotal", "tax_total", "shipping_total", "total"],
    });

    // Calculate shipping tax total
    const shippingTaxTotal = order.shipping_methods.reduce((acc, method) => {
      return acc + (method.tax_total || 0);
    }, 0);

    if (!order) {
      throw new Error("Order not found");
    }

    const customerName = `${order.shipping_address.first_name} ${order.shipping_address.last_name}`;
    const customerNifCif =
      order.shipping_address.metadata?.nif_cif ||
      order.customer.metadata?.nif_cif;
    const billingAddress = order.billing_address
      ? `${order.billing_address.address_1}${
          order.billing_address.address_2
            ? " " + order.billing_address.address_2
            : ""
        }`
      : `${order.shipping_address.address_1}${
          order.shipping_address.address_2
            ? " " + order.shipping_address.address_2
            : ""
        }`;
    const billingCountryLabel =
      this.countryLabel[
        order.billing_address
          ? order.billing_address.country_code.toLocaleUpperCase()
          : order.shipping_address.country_code.toLocaleUpperCase()
      ];
    const billingCityCountry = order.billing_address
      ? `${order.billing_address.city} (${order.billing_address.province}), ${billingCountryLabel}`
      : `${order.shipping_address.city} (${order.shipping_address.province}), ${billingCountryLabel}`;

    const billingPostalCode = order.billing_address
      ? `${order.billing_address.postal_code}`
      : `${order.shipping_address.postal_code}`;
    const billingPhone = order.billing_address
      ? `${order.billing_address.phone}`
      : order.shipping_address.phone
      ? `${order.shipping_address.phone}`
      : `${order.customer.phone}`;

    const subtotal = order.subtotal / 100;
    const taxes = order.tax_total / 100;
    const shipping = (order.shipping_total + shippingTaxTotal) / 100;
    const discount = order.discounts.reduce((acc, discount) => {
      return acc + (discount.rule.value / 100) * subtotal;
    }, 0);
    const subtotalAfterDiscount = subtotal - discount;
    const invoiceCreatedAt = new Date(order.created_at).toLocaleDateString();
    const invoiceFileName = `Cartago4x4_${invoiceCreatedAt.replace(
      /\//g,
      ""
    )}_${order.display_id}.pdf`;
    const invoiceId =
      order.billing_address?.metadata?.invoice_id ||
      order.shipping_address?.metadata?.invoice_id;

    const invoiceDatesTextContent = [
      { text: "Fecha de factura: ", bold: true },
      invoiceCreatedAt,
      "\n\n",
      { text: "Fecha de cargo: ", bold: true },
      invoiceCreatedAt,
      "\n\n",
      { text: "Nº de factura: ", bold: true },
      invoiceId,
    ];

    const receiptDatesTextContent = [
      { text: "Fecha: ", bold: true },
      invoiceCreatedAt,
    ];

    let orderInfoTable = [
      [
        {
          text: this.businessInfoContent,
          alignment: "left",
          style: "columnStyle",
        },
      ],
    ];

    if (invoiceId) {
      orderInfoTable[0].push({
        text: invoiceDatesTextContent as (
          | string
          | { text: string; bold: boolean }
        )[],
        alignment: "left",
        style: "columnStyle",
      });
    }

    const printer = new pdfmake(Roboto);

    const docDefinition = {
      content: [
        {
          columns: [
            {
              text: "Cartago4x4",
              style: "header",
              margin: [0, 38, 0, 0], // Ajusta el margen superior para alinear con el logo
            },
            {
              stack: [
                {
                  canvas: [
                    {
                      type: "ellipse",
                      x: 28,
                      y: 28,
                      color: "#090000",
                      r1: 28,
                      r2: 28,
                    },
                  ],
                  width: 56,
                  height: 56,
                  alignment: "right",
                },
                {
                  image: "logo",
                  width: 36,
                  height: 36,
                  alignment: "right",
                  fit: [36, 36],
                  margin: [10, -46, 0, 0], // Ajusta la posición del logo sobre el círculo
                },
              ],
            },
          ],
          columnGap: 10,
          margin: [0, -28, 0, 10],
        },
        {
          canvas: [
            {
              type: "line",
              x1: 0,
              y1: 0,
              x2: 515,
              y2: 0,
              lineWidth: 1,
              lineColor: "#333",
            },
          ],
          margin: [0, 0, 0, 10],
        },
        { text: invoiceId ? "" : receiptDatesTextContent, alignment: "right" },
        {
          table: {
            widths: invoiceId ? ["*", "auto"] : ["*"],
            body: orderInfoTable,
          },
          layout: {
            fillColor: function (rowIndex, node, columnIndex) {
              return "#f1f1f1";
            },
            paddingLeft: function (i, node) {
              return 10;
            },
            paddingRight: function (i, node) {
              return 10;
            },
            paddingTop: function (i, node) {
              return 5;
            },
            paddingBottom: function (i, node) {
              return 5;
            },
          },
          margin: [0, 10, 0, 10],
        },
        {
          text: invoiceId ? "Facturar a:" : "",
          style: "subheader",
        },
        {
          columns: [
            {
              width: "*",
              text: [
                { text: "Nombre del cliente: ", bold: true },
                customerName,
                "\n",
                { text: "NIF/CIF: ", bold: true },
                customerNifCif,
                "\n",
                { text: "Teléfono: ", bold: true },
                billingPhone,
              ],
              alignment: "left",
              style: "columnStyle",
            },
            {
              width: "auto",
              text: [
                { text: "Dirección: ", bold: true },
                billingAddress,
                "\n",
                { text: "Ciudad/País: ", bold: true },
                billingCityCountry,
                "\n",
                { text: "Código Postal: ", bold: true },
                billingPostalCode,
              ],
              alignment: "left",
              style: "columnStyle",
            },
          ],
          margin: [0, 0, 0, 10],
        },
        {
          style: "tableExample",
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto"],
            body: [
              [
                { text: "Descripción", style: "tableHeader" },
                {
                  text: "Unidades",
                  style: ["tableHeader", "centerText"],
                  alignment: "center",
                },
                {
                  text: "Precio Unitario",
                  style: ["tableHeader", "centerText"],
                },
                { text: "Precio", style: ["tableHeader", "centerText"] },
              ],
              ...order.items.map((item: LineItem) => {
                const includeTaxes = item.includes_tax || false;
                const taxRate =
                  item.tax_lines.length > 0 ? item.tax_lines[0].rate / 100 : 0;
                const unitPriceWithoutTax = includeTaxes
                  ? item.unit_price / (1 + taxRate)
                  : item.unit_price;
                const itemTotalWithoutTax =
                  (unitPriceWithoutTax * item.quantity) / 100;

                const parentCategories = item.variant.product.categories
                  .slice(0, 2)
                  .map((cat) => cat.name)
                  .join(" ");
                return [
                  {
                    text: [
                      { text: `${item.title}\n`, bold: true },
                      { text: parentCategories, fontSize: 10 },
                    ],
                    margin: [0, 5],
                  },
                  {
                    text: item.quantity,
                    style: "centerText",
                    alignment: "center",
                    margin: [0, 10],
                  },
                  {
                    text: (unitPriceWithoutTax / 100).toFixed(2),
                    style: "centerText",
                    alignment: "center",
                    margin: [0, 10],
                  },
                  {
                    text: itemTotalWithoutTax.toFixed(2),
                    style: "centerText",
                    alignment: "center",
                    margin: [0, 10],
                  },
                ];
              }),
            ],
          },
        },
        {
          table: {
            widths: ["*", "auto"],
            body: [
              [
                {
                  text: "SUBTOTAL:",
                  style: "summaryLabel",
                  margin: [0, 0, 15, 0],
                },
                {
                  text: `€${subtotal.toFixed(2)}`,
                  style: "summaryValue",
                  margin: [0, 0, 5, 0],
                },
              ],
              [
                {
                  text: "DESCUENTO:",
                  style: "summaryLabel",
                  margin: [0, 0, 15, 0],
                },
                {
                  text: `€${discount.toFixed(2)}`,
                  style: "summaryValue",
                  margin: [0, 0, 5, 0],
                },
              ],
              [
                {
                  text: "SUBTOTAL MENOS DESCUENTO:",
                  style: "summaryLabel",
                  margin: [0, 0, 15, 0],
                },
                {
                  text: `€${subtotalAfterDiscount.toFixed(2)}`,
                  style: "summaryValue",
                  margin: [0, 0, 5, 0],
                },
              ],
              [
                {
                  text: "ENVÍO:",
                  style: "summaryLabel",
                  margin: [0, 0, 15, 0],
                },
                {
                  text: `€${shipping.toFixed(2)}`,
                  style: "summaryValue",
                  margin: [0, 0, 5, 0],
                },
              ],
              [
                {
                  text: "IVA (21%):",
                  style: "summaryLabel",
                  margin: [0, 0, 15, 0],
                },
                {
                  text: `€${taxes.toFixed(2)}`,
                  style: "summaryValue",
                  margin: [0, 0, 5, 0],
                },
              ],
              [
                {
                  text: "TOTAL:",
                  style: "summaryLabelBold",
                  margin: [0, 0, 15, 0],
                },
                {
                  text: `€${(subtotalAfterDiscount + taxes + shipping).toFixed(
                    2
                  )}`,
                  style: "summaryValueBold",
                  margin: [0, 0, 5, 0],
                },
              ],
            ],
          },
          layout: {
            defaultBorder: false,
            hLineWidth: function (i, node) {
              return i === node.table.body.length ? 1 : 0;
            },
            vLineWidth: function () {
              return 0;
            },
            hLineColor: function (i, node) {
              return i === node.table.body.length ? "#333" : "white";
            },
            paddingLeft: function () {
              return 0;
            },
            paddingRight: function () {
              return 0;
            },
            paddingTop: function () {
              return 5;
            },
            paddingBottom: function () {
              return 5;
            },
          },
          alignment: "right",
        },
        {
          text: "¡Gracias por su compra!",
          style: "footer",
        },
      ],
      images: {
        logo: LogoCartago,
      },
      styles: {
        header: {
          fontSize: 22,
          bold: true,
          margin: [0, 0, 0, 10],
        },
        subheader: {
          fontSize: 16,
          bold: true,
          margin: [0, 10, 0, 5],
        },
        invoiceDataBox: {
          background: "#f0f0f0",
        },
        tableExample: {
          margin: [0, 5, 0, 15],
        },
        tableHeader: {
          bold: true,
          fontSize: 13,
          color: "#333",
          fillColor: "#f0f0f0",
        },
        summaryLabel: {
          fontSize: 12,
          bold: true,
          alignment: "right",
        },
        summaryValue: {
          fontSize: 12,
          alignment: "right",
        },
        summaryLabelBold: {
          fontSize: 14,
          bold: true,
          alignment: "right",
        },
        summaryValueBold: {
          fontSize: 14,
          bold: true,
          alignment: "right",
        },
        footer: {
          margin: [0, 50, 0, 0],
          alignment: "center",
        },
        columnStyle: {
          fillColor: "#f0f0f0",
        },
        centerText: {
          alignment: "center",
          valign: "middle",
        },
        leftText: {
          alignment: "left",
          valign: "middle",
        },
      },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    return new Promise((resolve, reject) => {
      pdfDoc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve({ buffer: pdfBuffer, fileName: invoiceFileName });
      });
      pdfDoc.on("error", (err) => {
        reject(err);
      });
      pdfDoc.end();
    });
  }
}

export default InvoiceGeneratorService;
