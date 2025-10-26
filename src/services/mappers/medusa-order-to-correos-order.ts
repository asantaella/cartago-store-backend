import { Order } from "@medusajs/medusa";
import {
  PreregisterDto,
  Shipment,
  Package,
  PackageContents,
  CustomsData,
  Addressee,
  Sender,
} from "../../types/correos/preregister/request";
import {
  CORREOS_SHIPMENT_CONSTANTS,
  CORREOS_PACKAGE_CONSTANTS,
  CORREOS_PACKAGE_CONTENTS_CONSTANTS,
  CORREOS_CUSTOMS_DATA_CONSTANTS,
  CORREOS_ADDRESSEE_CONSTANTS,
  CORREOS_SENDER_CONSTANTS,
} from "../../constants/correos-constants";

import dotenv from "dotenv";
dotenv.config();
export class MedusaOrderToCorreosOrderMapper {
  private readonly contractNumber: string;
  private readonly clientNumber: string;
  private readonly labellerCode: string;
  private readonly product: string;
  private readonly deliveryMethod: string;
  private readonly admissionProvince: string;

  /**
   * Constructor que inicializa la configuración desde variables de entorno
   * @throws Error si faltan variables de entorno requeridas
   */
  constructor() {
    this.contractNumber = process.env.CORREOS_CONTRACT_NUMBER || "";
    this.clientNumber = process.env.CORREOS_CLIENT_NUMBER || "";
    this.labellerCode = process.env.CORREOS_LABELLER_CODE || "";
    this.product = process.env.CORREOS_PRODUCT || "";
    this.deliveryMethod = process.env.CORREOS_DELIVERY_METHOD || "";
    this.admissionProvince = process.env.CORREOS_ADMISSION_PROVINCE || "";

    this.validateEnvConfig();
  }

  /**
   * Valida que todas las variables de entorno requeridas estén definidas
   * @throws Error si faltan variables de entorno
   */
  private validateEnvConfig(): void {
    const missingVars: string[] = [];

    if (!this.contractNumber) missingVars.push("CORREOS_CONTRACT_NUMBER");
    if (!this.clientNumber) missingVars.push("CORREOS_CLIENT_NUMBER");
    if (!this.labellerCode) missingVars.push("CORREOS_LABELLER_CODE");
    if (!this.product) missingVars.push("CORREOS_PRODUCT");
    if (!this.deliveryMethod) missingVars.push("CORREOS_DELIVERY_METHOD");
    if (!this.admissionProvince) missingVars.push("CORREOS_ADMISSION_PROVINCE");

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables for Correos integration: ${missingVars.join(
          ", "
        )}`
      );
    }
  }

  /**
   * Calcula el peso total de todos los items de un pedido en gramos
   */
  private calculateTotalWeight(order: Order): string {
    const totalWeight = order.items.reduce((total, item) => {
      const itemWeight = (item.variant?.weight || 10) * item.quantity;
      return total + itemWeight;
    }, 0);

    return totalWeight.toString();
  }

  /**
   * Mapea los items del pedido a datos aduaneros
   */
  private mapOrderItemsToCustomsData(order: Order): CustomsData[] {
    return order.items.map((item) => ({
      quantity: item.quantity.toString(),
      description: item.title,
      netWeight: (item.variant?.weight || 10).toString(),
      netValue: (item.unit_price / 100).toFixed(2), // Convertir de centavos a euros
      tariffNumber: "",
      countryOrigin: CORREOS_CUSTOMS_DATA_CONSTANTS.COUNTRY_ORIGIN,
    }));
  }

  /**
   * Crea el contenido del paquete
   */
  private createPackageContents(order: Order): PackageContents {
    return {
      shipmentType: CORREOS_PACKAGE_CONTENTS_CONSTANTS.SHIPMENT_TYPE,
      invoiceNumber: "",
      licenseNumber: "",
      certificateNumber: "",
      customReferenceConsignor: "",
      importerTaxReference: "",
      importerVatNumber: "",
      importerCode: "",
      phoneNumber: "",
      importerEmail: "",
      instructionsDoNotDeliver:
        CORREOS_PACKAGE_CONTENTS_CONSTANTS.INSTRUCTIONS_DO_NOT_DELIVER,
      customsData: this.mapOrderItemsToCustomsData(order),
    };
  }

  /**
   * Crea la información del paquete
   */
  private createPackage(order: Order): Package {
    //  const totalWeight = this.calculateTotalWeight(order);
    const packageId =
      order.items.length > 0
        ? order.items[0].title
        : `Order ${order.display_id}`;
    const totalWeight =
      order.shipping_address.metadata?.weight?.toString() || "";
    const totalLength =
      order.shipping_address.metadata?.length?.toString() || "";
    const totalWidth = order.shipping_address.metadata?.width?.toString() || "";
    const totalHigh = order.shipping_address.metadata?.height?.toString() || "";

    return {
      packageId,
      packageWeightGrams: totalWeight,
      packageHeight: totalHigh || CORREOS_PACKAGE_CONSTANTS.DEFAULT_HEIGHT,
      packageWidth: totalWidth || CORREOS_PACKAGE_CONSTANTS.DEFAULT_WIDTH,
      packageLength: totalLength || CORREOS_PACKAGE_CONSTANTS.DEFAULT_LENGTH,
      cubicMeters: "",
      clientReference: "",
      clientReference2: "",
      clientReference3: "",
      observations: "",
      packingIndicator: "",
      packageContents: this.createPackageContents(order),
    };
  }
  private sanitizePhoneNumber(phone: string): string {
    //Si el phone tiene más de 9 digitos y tiene el prefijo +34 o cualquiera otros dos digitos iniciales, se elimina
    return phone.replace(/^\+\d{2}/, "").replace(/\s+/g, "");
  }

  /**
   * Mapea la dirección de envío del pedido al destinatario de Correos
   */
  private mapShippingAddressToAddressee(order: Order): Addressee {
    const shippingAddress = order.shipping_address;

    if (!shippingAddress) {
      throw new Error("Order must have a shipping address");
    }

    // Extraer el código de provincia desde los metadatos o usar valor por defecto
    const provinceCode =
      (shippingAddress.metadata?.address_province_code as string) || "";

    return {
      name: shippingAddress.first_name || "",
      lastName1: shippingAddress.last_name || "",
      lastName2: "",
      doiType: "",
      doiNumber: "",
      company: "",
      contactPerson: "",
      addressType: "",
      address: shippingAddress.address_1 || "",
      number: "",
      portal: "",
      block: "",
      staircase: "",
      floor: "",
      door: "",
      addressComplement: "",
      locality: shippingAddress.city || "",
      province: provinceCode,
      cp: shippingAddress.postal_code || "",
      zip: "",
      country: CORREOS_ADDRESSEE_CONSTANTS.COUNTRY,
      contactPhone: shippingAddress.phone || "",
      email: order.email || "",
      smsNumber: this.sanitizePhoneNumber(shippingAddress.phone) || "",
      language: CORREOS_ADDRESSEE_CONSTANTS.LANGUAGE,
      chosenOffice: "",
      homepaqCode: "",
    };
  }

  /**
   * Crea la información del remitente con datos estáticos de Cartago
   */
  private createSender(): Sender {
    return {
      name: CORREOS_SENDER_CONSTANTS.NAME,
      lastName1: CORREOS_SENDER_CONSTANTS.LAST_NAME_1,
      lastName2: CORREOS_SENDER_CONSTANTS.LAST_NAME_2,
      doiType: CORREOS_SENDER_CONSTANTS.DOI_TYPE,
      doiNumber: CORREOS_SENDER_CONSTANTS.DOI_NUMBER,
      company: CORREOS_SENDER_CONSTANTS.COMPANY,
      contactPerson: CORREOS_SENDER_CONSTANTS.CONTACT_PERSON,
      addressType: CORREOS_SENDER_CONSTANTS.ADDRESS_TYPE,
      address: CORREOS_SENDER_CONSTANTS.ADDRESS,
      number: CORREOS_SENDER_CONSTANTS.NUMBER,
      portal: "",
      block: "",
      staircase: "",
      floor: "",
      door: "",
      addressComplement: CORREOS_SENDER_CONSTANTS.ADDRESS_COMPLEMENT,
      locality: CORREOS_SENDER_CONSTANTS.LOCALITY,
      province: CORREOS_SENDER_CONSTANTS.PROVINCE,
      cp: CORREOS_SENDER_CONSTANTS.CP,
      zip: "",
      country: CORREOS_SENDER_CONSTANTS.COUNTRY,
      contactPhone: CORREOS_SENDER_CONSTANTS.CONTACT_PHONE,
      email: CORREOS_SENDER_CONSTANTS.EMAIL,
      smsNumber: "",
      language: CORREOS_SENDER_CONSTANTS.LANGUAGE,
      chosenOffice: "",
      homepaqCode: "",
    };
  }

  /**
   * Crea la información del envío
   */
  private createShipment(order: Order): Shipment {
    //const totalWeight = this.calculateTotalWeight(order);
    const totalWeight =
      order.shipping_address.metadata?.weight?.toString() || "";
    const totalLength =
      order.shipping_address.metadata?.length?.toString() || "";
    const totalWidth = order.shipping_address.metadata?.width?.toString() || "";
    const totalHigh = order.shipping_address.metadata?.height?.toString() || "";

    return {
      admissionProvince: this.admissionProvince,
      packagesNumber: CORREOS_SHIPMENT_CONSTANTS.PACKAGES_NUMBER,
      product: this.product,
      deliveryMethod: this.deliveryMethod,
      manifestCode: "",
      totalWeight,
      totalLength,
      totalWidth,
      totalHigh,
      contractNumber: this.contractNumber,
      clientNumber: this.clientNumber,
      labellerCode: this.labellerCode,
      totalCubicMeters: "",
      shipmentReference1: "",
      shipmentReference2: "",
      shipmentReference3: "",
      shipmentNotes: "",
      dateExpiry: "",
      modificationType: CORREOS_SHIPMENT_CONSTANTS.MODIFICATION_TYPE,
      packages: [this.createPackage(order)],
      addressee: this.mapShippingAddressToAddressee(order),
      sender: this.createSender(),
    };
  }

  /**
   * Transforma un pedido de MedusaJS a la entidad de pre-registro de Correos
   *
   * @param order Pedido de MedusaJS con relaciones cargadas (items, items.variant, shipping_address)
   * @returns DTO de pre-registro para la API de Correos
   * @throws Error si faltan datos requeridos en el pedido
   */
  transform(order: Order): PreregisterDto {
    // Validar que el pedido tenga la información necesaria
    if (!order) {
      throw new Error("Order is required");
    }

    if (!order.shipping_address) {
      throw new Error("Order must have a shipping address");
    }

    if (!order.items || order.items.length === 0) {
      throw new Error("Order must have at least one item");
    }

    // Crear el DTO de pre-registro
    return {
      errorCodeLanguage: CORREOS_SHIPMENT_CONSTANTS.ERROR_CODE_LANGUAGE,
      shipments: [this.createShipment(order)],
    };
  }
}
