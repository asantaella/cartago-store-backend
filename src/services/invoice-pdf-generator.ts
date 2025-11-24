import { BaseService } from "medusa-interfaces";
import { LineItem, Order, OrderService } from "@medusajs/medusa";
import pdfmake from "pdfmake";
import Roboto from "../fonts/Roboto";
import LogoCartago from "../types/logo";
import * as variantUtils from "../utils/variant-utils";
import { InvoiceMode, OrderInvoice } from "../types/order-invoice.model";

class InvoicePdfGeneratorService extends BaseService {
  protected orderService: OrderService;

  constructor(container) {
    super(container);
    this.orderService = container.orderService;
  }

  async generateInvoice(
    orderId: string,
    invoiceMode: InvoiceMode = "invoice"
  ): Promise<{ buffer: Buffer; fileName: string }> {
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
        "shipping_methods.tax_lines",
        "items.tax_lines",
      ],
      select: [
        "subtotal",
        "tax_total",
        "shipping_total",
        "discount_total",
        "gift_card_total",
        "total",
        "paid_total",
      ],
    });

    if (!order) {
      throw new Error("Order not found");
    }

    const orderInvoice = new OrderInvoice(order);
    const subtotal = orderInvoice.getSubtotal();
    const discount = orderInvoice.getDiscount();
    const taxes = orderInvoice.getTaxes();
    const shipping = orderInvoice.getShipping();
    // El total ya está calculado correctamente en la orden
    const total = orderInvoice.getTotal();
    const invoiceId = orderInvoice.getInvoiceId();
    const invoiceFileMode = invoiceMode === "invoice" ? "factura" : "recibo";
    const invoiceFileName = `Cartago4x4_${invoiceFileMode}_${order.display_id}_${invoiceId}.pdf`;

    // console.log(`ℹ️ℹ️ℹ️ ORDER With discount: ${JSON.stringify(order)}`);

    const printer = new pdfmake(Roboto);

    const customerFields = [
      [
        {
          text: "Razón social:",
          bold: true,
          alignment: "right",
          margin: [0, 0, 5, 0],
        },
        {
          text:
            orderInvoice.getBillingCompanyName() ||
            orderInvoice.getAddressCompanyName() ||
            orderInvoice.getCustomerName(),
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
    ];

    if (invoiceMode === "invoice") {
      customerFields.push(
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
        ]
      );
    }

    const docDefinition = {
      pageSize: "A4",
      pageMargins: [40, 80, 40, 60], // Márgenes fijos y simples
      header: function (currentPage, pageCount) {
        // Margen inferior fijo de 20px para todas las páginas
        return {
          margin: [40, 20, 40, 0],
          stack: [
            {
              columns: [
                {
                  text: "ACCESORIOS CARTAGO S.L.U.",
                  style: "header",
                  margin: [0, 30, 0, 0],
                },
                {
                  image: "logo",
                  width: 56,
                  height: 56,
                  alignment: "right",
                },
              ],
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
              margin: [0, 0, 0, 0],
            },
          ],
        };
      },
      footer: function (currentPage, pageCount) {
        return [
          {
            columns: [
              {
                text: `Página ${currentPage} de ${pageCount}`,
                alignment: "left",
                margin: [40, 10, 0, 0],
                fontSize: 10,
                color: "#666666",
              },
              currentPage === pageCount
                ? {
                    text: "Cartago4x4©Todos los derechos reservados",
                    alignment: "right",
                    margin: [0, 10, 40, 0],
                    fontSize: 10,
                    color: "#666666",
                  }
                : "",
            ],
          },
        ];
      },
      content: [
        {
          table: {
            headerRows: 1,
            widths: ["*"],
            body: [
              // Primera fila: bloque que se repite en cada página
              [
                {
                  columns: [
                    {
                      width: "40%",
                      text: [
                        { text: "Dirección: ", bold: true },
                        {
                          text: "Alameda San Antón 23\n(Apdo. Correos 5085)\nCartagena, Murcia, España\n",
                        },
                        { text: "C.P.: ", bold: true },
                        { text: "30205\n" },
                        { text: "CIF: ", bold: true },
                        { text: "B75682930\n" },
                        { text: "Email: ", bold: true },
                        { text: "contacto@cartago4x4.es\n" },
                        { text: "Web: ", bold: true },
                        { text: "https://cartago4x4.es" },
                      ],
                      alignment: "left",
                      margin: [0, 10, 0, 0],
                    },
                    {
                      width: "*",
                      text: customerFields
                        .map((field) => [
                          { text: field[0].text + " ", bold: true },
                          { text: field[1].text + "\n" },
                        ])
                        .flat(),
                      alignment: "left",
                      margin: [0, 10, 0, 0],
                    },
                  ],
                  columnGap: 20,
                  margin: [0, 0, 0, 20],
                },
              ],
              // Segunda fila: contenido principal
              [
                {
                  stack: [
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
                            {
                              text: "Precio",
                              style: ["tableHeader", "centerText"],
                            },
                          ],
                          ...order.items.map((item: LineItem, index) => {
                            const includeTaxes = item.includes_tax || false;
                            const taxRate =
                              item.tax_lines.length > 0
                                ? item.tax_lines[0].rate / 100
                                : 0;
                            const itemTotalWithoutTax = item.subtotal / 100;

                            const parentCategories =
                              variantUtils.formatVariantCategories(
                                item.variant
                              );

                            return [
                              {
                                text: [
                                  { text: `${item.title}\n`, bold: true },
                                  { text: parentCategories, fontSize: 10 },
                                ],
                                margin: [0, 2],
                              },
                              {
                                text: item.quantity,
                                style: "centerText",
                                alignment: "center",
                                margin: [0, 7],
                              },
                              {
                                text: `€${
                                  item.subtotal
                                    ? (
                                        item.subtotal /
                                        item.quantity /
                                        100
                                      ).toFixed(2)
                                    : 0
                                }`,
                                style: "centerText",
                                alignment: "center",
                                margin: [0, 7],
                              },
                              {
                                text: `€${itemTotalWithoutTax.toFixed(2)}`,
                                style: "centerText",
                                alignment: "center",
                                margin: [0, 7],
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
                      // Evitar que la tabla de resumen se divida entre páginas
                      unbreakable: true,
                      table: {
                        widths: ["*", "auto"],
                        body: [
                          [
                            {
                              text: "SUBTOTAL:",
                              style: "summaryLabel",
                              margin: [0, 0, 4, 0],
                            },
                            {
                              text: `€${subtotal.toFixed(2)}`,
                              style: "summaryValue",
                              margin: [0, 0, 4, 0],
                            },
                          ],
                          ...(discount > 0
                            ? [
                                [
                                  {
                                    text: "DESCUENTO:",
                                    style: "summaryLabel",
                                    margin: [0, 0, 4, 0],
                                  },
                                  {
                                    text: `-€${discount.toFixed(2)}`,
                                    style: "summaryValue",
                                    margin: [0, 0, 4, 0],
                                  },
                                ],
                              ]
                            : []),
                          [
                            {
                              text: "ENVÍO:",
                              style: "summaryLabel",
                              margin: [0, 0, 4, 0],
                            },
                            {
                              text: `€${shipping.toFixed(2)}`,
                              style: "summaryValue",
                              margin: [0, 0, 4, 0],
                            },
                          ],
                          [
                            {
                              text: `IVA (${orderInvoice.getTaxRate()}%):`,
                              style: "summaryLabel",
                              margin: [0, 0, 4, 0],
                            },
                            {
                              text: `€${taxes}`,
                              style: "summaryValue",
                              margin: [0, 0, 4, 0],
                            },
                          ],
                          [
                            {
                              text: "TOTAL:",
                              style: "summaryLabelBold",
                              margin: [0, 0, 4, 0],
                            },
                            {
                              text: `€${total.toFixed(2)}`,
                              style: "summaryValueBold",
                              margin: [0, 0, 4, 20],
                            },
                          ],
                        ],
                      },
                      layout: {
                        defaultBorder: false,
                        hLineWidth: function (i, node) {
                          if (i === 1) return 2;
                          return i === node.table.body.length ? 1 : 0;
                        },
                        vLineWidth: function () {
                          return 0;
                        },
                        hLineColor: function (i, node) {
                          return i === node.table.body.length
                            ? "#333"
                            : "white";
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
                          return 4;
                        },
                      },
                      alignment: "right",
                    },
                  ],
                },
              ],
            ],
          },
          layout: {
            defaultBorder: false,
            hLineWidth: function () {
              return 0;
            },
            vLineWidth: function () {
              return 0;
            },
          },
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
