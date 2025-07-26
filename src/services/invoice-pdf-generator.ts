import { BaseService } from "medusa-interfaces";
import { LineItem, Order, OrderService } from "@medusajs/medusa";
import pdfmake from "pdfmake";
import Roboto from "../fonts/Roboto";
import LogoCartago from "../types/logo";
import * as variantUtils from "../utils/variant-utils";
import { OrderInvoice } from "../types/order-invoice.model";
class InvoicePdfGeneratorService extends BaseService {
  protected orderService: OrderService;

  constructor(container) {
    super(container);
    this.orderService = container.orderService;
  }

  private businessInfoContent = [
    { text: "Dirección: ", bold: true },
    "Alameda San Antón 23 (Apdo. Correos 5085)\n",
    { text: "Ciudad, País: ", bold: true },
    "Cartagena, Murcia, España\n",
    { text: "Código Postal: ", bold: true },
    "30205\n",
    { text: "CIF: ", bold: true },
    "B75682930\n",
    { text: "Email: ", bold: true },
    "contacto@cartago4x4.es",
  ];

  async generateInvoice(orderId): Promise<{ buffer: Buffer; fileName: string }> {
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

    if (!order) {
      throw new Error("Order not found");
    }

    const orderInvoice = new OrderInvoice(order);
    const subtotal = orderInvoice.getSubtotal();
    const discount = orderInvoice.getDiscount();
    const subtotalAfterDiscount = orderInvoice.getSubtotalAfterDiscount();
    const taxes = orderInvoice.getTaxes();
    const shipping = orderInvoice.getShipping();
    const total = subtotalAfterDiscount + taxes + shipping;
    const invoiceId = orderInvoice.getInvoiceId();
    const invoiceFileName = `Cartago4x4_factura_${order.display_id}_${invoiceId}.pdf`;

    const printer = new pdfmake(Roboto);

    const docDefinition = {
      pageSize: "A4",
      content: [
        {
          columns: [
            {
              text: "ACCESORIOS CARTAGO S.L.U",
              style: "header",
              margin: [0, 36, 0, 0], // Ajusta el margen superior para alinear con el logo
            },
            {
              stack: [
                {
                  image: "logo",
                  width: 56,
                  height: 56,
                  alignment: "right",
                  fit: [56, 56],
                  margin: [10, 0, 0, 0], // Ajusta la posición del logo sobre el círculo
                },
              ],
            },
          ],
          columnGap: 10,
          margin: [0, -26, 0, 10],
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

        {
          columns: [
            {
              width: "40%",
              stack: [
                {
                  table: {
                    widths: [60, "*"],

                    body: [
                      [
                        {
                          text: "Dirección:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        {
                          text: "Alameda San Antón 23\n(Apdo. Correos 5085)\nCartagena, Murcia, España",
                          alignment: "left",
                        },
                      ],
                      [
                        {
                          text: "C.P.:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        { text: "30205", alignment: "left" },
                      ],
                      [
                        {
                          text: "CIF:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        { text: "B75682930", alignment: "left" },
                      ],
                      [
                        {
                          text: "Email:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        { text: "contacto@cartago4x4.es", alignment: "left" },
                      ],
                      [
                        {
                          text: "Web:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        { text: "https://cartago4x4.es", alignment: "left" },
                      ],
                    ],
                  },
                  layout: {
                    defaultBorder: false,
                    paddingTop: function () {
                      return 2;
                    },
                    paddingBottom: function () {
                      return 2;
                    },
                    paddingRight: function () {
                      return 0;
                    },
                    paddingLeft: function () {
                      return 0;
                    },
                  },
                  style: "columnStyle",
                },
              ],
            },
            {
              width: "*",
              stack: [
                {
                  table: {
                    widths: [85, "*"],
                    body: [
                      [
                        {
                          text: "Razón social:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        {
                          text: orderInvoice.getCustomerName(),
                          alignment: "left",
                        },
                      ],
                      [
                        {
                          text: "Dirección:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        {
                          text: orderInvoice.getCustomerFullAddress(),
                          alignment: "left",
                        },
                      ],
                      [
                        {
                          text: "C.P:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        {
                          text: orderInvoice.getBillingPostalCode(),
                          alignment: "left",
                        },
                      ],
                      [
                        {
                          text: "NIF/CIF:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        {
                          text: orderInvoice.getCustomerNifCif()
                            ? orderInvoice.getCustomerNifCif()
                            : "-",
                          alignment: "left",
                        },
                      ],
                      [
                        {
                          text: "Fecha factura:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        {
                          text: orderInvoice.getInvoiceCreatedAt(),
                          alignment: "left",
                        },
                      ],
                      [
                        {
                          text: "Nº factura:",
                          bold: true,
                          alignment: "right",
                          margin: [0, 0, 5, 0],
                        },
                        {
                          text: orderInvoice.getInvoiceId(),
                          alignment: "left",
                        },
                      ],
                    ],
                  },
                  layout: {
                    defaultBorder: false,
                    paddingTop: function () {
                      return 2;
                    },
                    paddingBottom: function () {
                      return 2;
                    },
                    paddingLeft: function () {
                      return 0;
                    },
                  },
                  style: "columnStyle",
                },
              ],
            },
          ],
          columnGap: 20,
          margin: [0, 0, 0, 40],       
        },
        {
          style: "tableExample",
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto"],
            heights: function (rowIndex: number) {
              // 20px de espacio para la fila entre cabecera y primer cuerpo
              return rowIndex === 1 ? 20 : null;
            },
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
              ...order.items.map((item: LineItem, index) => {
                const includeTaxes = item.includes_tax || false;
                const taxRate =
                  item.tax_lines.length > 0 ? item.tax_lines[0].rate / 100 : 0;
                const unitPriceWithoutTax = includeTaxes
                  ? item.unit_price / (1 + taxRate)
                  : item.unit_price;
                const itemTotalWithoutTax =
                  (unitPriceWithoutTax * item.quantity) / 100;

                const parentCategories = variantUtils.formatVariantCategories(
                  item.variant
                );

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
                    text: `€${(unitPriceWithoutTax / 100).toFixed(2)}`,
                    style: "centerText",
                    alignment: "center",
                    margin: [0, 10],
                  },
                  {
                    text: `€${itemTotalWithoutTax.toFixed(2)}`,
                    style: "centerText",
                    alignment: "center",
                    margin: [0, 10],
                  },
                ];
              }),
            ],
          },
          layout: {
            defaultBorder: true,
            hLineWidth: function (i, node) {
              if (i === 1) return 2; // Borde inferior de cabecera de 2px
              return 5; // Bordes entre filas de 5px
            },
            vLineWidth: function () {
              return 0; // Sin bordes verticales
            },
            hLineColor: function (i) {
              return i === 1 ? "#0d364c" : "#ffffff"; // Azul para cabecera, blanco para separaciones
            },
            fillColor: function (rowIndex) {
              // Sin color para cabecera, azul claro para filas alternas del body
              return rowIndex > 0 ? "#e6f0ff" : null;
            },
            paddingTop: function (i) {
              return 4;
            },
            paddingBottom: function (i) {
              return 4;
            },
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
                  margin: [0, 0, 5, 0],
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
                  margin: [0, 0, 5, 0],
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
                  margin: [0, 0, 5, 0],
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
                  margin: [0, 0, 5, 0],
                },
                {
                  text: `€${shipping.toFixed(2)}`,
                  style: "summaryValue",
                  margin: [0, 0, 5, 0],
                },
              ],
              [
                {
                  text: `IVA (${orderInvoice.getTaxRate()}%):`,
                  style: "summaryLabel",
                  margin: [0, 0, 5, 0],
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
                  margin: [0, 0, 5, 0],
                },
                {
                  text: `€${total.toFixed(2)}`,
                  style: "summaryValueBold",
                  margin: [0, 0, 5, 20],
                },
              ],
            ],
          },
          layout: {
            defaultBorder: true,
            hLineWidth: function (i, node) {
              if (i === 1) return 2;
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
              return 10;
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
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10],
          color: "#0d364c",
        },
        subheader: {
          color: "#0d364c",
          fontSize: 14,
          bold: true,
          margin: [0, 10, 0, 5],
        },
        invoiceDataBox: {
          // background: "#f0f0f0",
        },
        tableExample: {
          margin: [0, 5, 0, 0],
        },
        tableHeader: {
          bold: true,
          fontSize: 13,
          color: "#0d364c",
          margin: [0, 0, 0, 0], // Añadimos margen inferior de 20px
          // Eliminamos el fillColor para la cabecera
        },
        summaryLabel: {
          fontSize: 12,
          color: "#0d364c",
          bold: true,
          alignment: "right",
        },
        summaryValue: {
          fontSize: 12,
          alignment: "right",
        },
        summaryLabelBold: {
          fontSize: 12,
          color: "#0d364c",
          bold: true,
          alignment: "right",
        },
        summaryValueBold: {
          fontSize: 12,
          bold: true,
          alignment: "right",
        },
        footer: {
          margin: [0, 50, 0, 0],
          alignment: "center",
        },
        columnStyle: {
          // fillColor: "#f0f0f0",
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

export default InvoicePdfGeneratorService;
