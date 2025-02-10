import { BaseService } from "medusa-interfaces";
import { LineItem, Order, OrderService } from "@medusajs/medusa";
import path from "path";

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
    console.log("billingCityCountry", billingCityCountry);
    console.log("shipping method", order.shipping_methods[0].tax_lines[0]);
    console.log("shipping tax total", order.shipping_tax_total);
    // Calcular subtotal, taxes y shipping
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
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
      <style>
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');

      body {
      font-family: 'Roboto', sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f9f9f9;
      color: #333;
      }

      h1, h2, h3, h4, h5, h6 {
      color: #0f172a;
      }

      .invoice-container {
      width: 90%;
      margin: 15px auto;
      background: #fff;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 5px;
      }

      .invoice-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      border-bottom: 1px solid #ddd;
      }

      .invoice-footer {      
      display: flex;
      justify-content: center;
      }

      .company-info {  
      margin-right: 10px;
      width: ${invoiceId ? "auto" : "100%"}
      }

      .company-logo {
      background-color: #0f172a;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      }

      .invoice-ref {
      display: ${invoiceId ? "block" : "none"}
      }

      .invoice-data-box {
      background-color: #f0f0f0;
      padding: 0 15px;
      }

      .invoice-details, .billing-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 15px;
      width:100%;
      }

      .billing-info {
      margin-top: -15px;
      }

      .invoice-field {
      font-weight: 600;
      color: #0f172a;      
      }
      
      .invoice-value {      
      background-color:#f0f0f0;
      padding: 2px;      
      }

      .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      }

      .invoice-table th, .invoice-table td {
      border: 1px solid #ddd;
      text-align: center;
      padding: 8px;
      }

      .invoice-table th {
      background-color: #f0f0f0;
      }

      .summary {      
      display: grid;
      grid-template-columns: 6fr 1fr;
      gap: 10px;
      justify-content: end;
      text-align: center;
      }

      .summary p, .summary h2 {
      text-align: right;
      margin: 5px 0;
      padding: 2px;
      }
      </style>
      </head>
      <body>
      <div class="invoice-container">
      <header class="invoice-header">
      <h1>Cartago4x4</h1>
      <div class="company-logo">
      <img src="https://pub-9f70c8529e1d47ab90225640bcffecd9.r2.dev/logo_96x96.png" width="64" height="64"></img>
      </div>
      </header>
      <div class="invoice-details">
      <div class="company-info invoice-data-box">
      <p><span class="invoice-field">Dirección:</span> 
      Alameda San Antón 23 (Apdo. Correos 5085)
      <br><span class="invoice-field">Ciudad, País:</span> Cartagena, Murcia, España
      <br><span class="invoice-field">Código Postal:</span> 30205  
      <br><span class="invoice-field">NIF/CIF:</span> 23036207-M
      <br><span class="invoice-field">Mail:</span> contacto@cartago4x4.es</p>
      </div>
      <div class="invoice-ref invoice-data-box">
      <p><span class="invoice-field">Fecha de factura:</span> 
      ${invoiceId ? invoiceCreatedAt : ""}</p>
      <p><span class="invoice-field">Fecha de cargo:</span> 
      ${invoiceId ? invoiceCreatedAt : ""}</p>
      <p><span class="invoice-field">Número de factura:</span> 
      ${invoiceId || ""}</p>
      </div>
      </div>
    
      <div>
        <h3 class="invoice-ref">Facturar a:</h3>
        <div class="billing-info">
          <div>
            <p><span class="invoice-field">Nombre del cliente:</span> ${customerName}
            <br><span class="invoice-field">NIF/CIF:</span> ${customerNifCif}
            <br><span class="invoice-field">Teléfono:</span> ${billingPhone}</p>
          </div>
          <div>
            <br><span class="invoice-field">Dirección:</span> ${billingAddress} 
            <br><span class="invoice-field">Ciudad/País:</span> ${billingCityCountry}
            <br><span class="invoice-field">Código Postal:</span> ${billingPostalCode}
          </div>      
        </div>     
      </div> 
     
      <table class="invoice-table">
      <thead>
      <tr>
      <th>Descripción</th>
      <th>Unidades</th>
      <th>Precio Unitario</th>
      <th>Precio</th>
      </tr>
      </thead>
      <tbody>
      ${order.items
        .map((item: LineItem) => {
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
          return `
        <tr>
        <td>${item.title}<br><small>${parentCategories}</small></td>
        <td>${item.quantity}</td>
        <td>${(unitPriceWithoutTax / 100).toFixed(2)}</td>
        <td>${itemTotalWithoutTax.toFixed(2)}</td>
        </tr>`;
        })
        .join("")}
      </tbody>
      </table>
    
      <div class="summary">
      <p>SUBTOTAL:</p><p class="invoice-value">€${subtotal.toFixed(2)}</p>
      <p>DESCUENTO:</p><p class="invoice-value">€${discount.toFixed(2)}</p>
      <p>SUBTOTAL MENOS DESCUENTO:</p><p class="invoice-value">€${subtotalAfterDiscount.toFixed(
        2
      )}</p>
      <p>ENVÍO:</p><p class="invoice-value">€${shipping.toFixed(2)}</p>      
      <p>IVA (21%):</p><p class="invoice-value">€${taxes.toFixed(2)}</p>      
      <h2>TOTAL:</h2><h2 class="invoice-value">€${(
        subtotalAfterDiscount +
        taxes +
        shipping
      ).toFixed(2)}</h2>
      </div>
      </div>
      <div class="invoice-footer">
      <p>¡Gracias por su compra!</p>
      </div>
      </body>
      </html>
    `;

    // Generate PDF using Puppeteer
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    return {
      buffer: pdfBuffer,
      fileName: invoiceFileName,
    };
  }
}

export default InvoiceGeneratorService;
