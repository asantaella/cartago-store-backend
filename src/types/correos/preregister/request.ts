/**
 * Interfaces para la entidad de Pre-registro de Correos
 * Estas interfaces representan la estructura de datos requerida por la API de Correos
 * para el pre-registro de envíos
 */

/**
 * Datos aduaneros de cada artículo del paquete
 */
export interface CustomsData {
  /** Cantidad de artículos */
  quantity: string;
  /** Descripción del artículo */
  description: string;
  /** Peso neto en gramos */
  netWeight: string;
  /** Valor neto del artículo */
  netValue: string;
  /** Código de tarifa arancelaria */
  tariffNumber: string;
  /** País de origen (código ISO 3166-1 alpha-3) */
  countryOrigin: string;
}

/**
 * Contenido del paquete incluyendo información aduanera
 */
export interface PackageContents {
  /** Tipo de envío: 1=Documentos, 2=Mercancías, 3=Devolución, 4=Regalo */
  shipmentType: string;
  /** Número de factura */
  invoiceNumber: string;
  /** Número de licencia */
  licenseNumber: string;
  /** Número de certificado */
  certificateNumber: string;
  /** Referencia aduanera del remitente */
  customReferenceConsignor: string;
  /** Referencia fiscal del importador */
  importerTaxReference: string;
  /** Número de IVA del importador */
  importerVatNumber: string;
  /** Código del importador */
  importerCode: string;
  /** Número de teléfono */
  phoneNumber: string;
  /** Email del importador */
  importerEmail: string;
  /** Instrucciones de no entrega: D=Devolver, A=Abandonar */
  instructionsDoNotDeliver: string;
  /** Datos aduaneros de los artículos */
  customsData: CustomsData[];
}

/**
 * Información de cada paquete del envío
 */
export interface Package {
  /** Identificador del paquete */
  packageId: string;
  /** Peso del paquete en gramos */
  packageWeightGrams: string;
  /** Alto del paquete en mm */
  packageHeight: string;
  /** Ancho del paquete en mm */
  packageWidth: string;
  /** Largo del paquete en mm */
  packageLength: string;
  /** Metros cúbicos */
  cubicMeters: string;
  /** Referencia del cliente */
  clientReference: string;
  /** Segunda referencia del cliente */
  clientReference2: string;
  /** Tercera referencia del cliente */
  clientReference3: string;
  /** Observaciones */
  observations: string;
  /** Indicador de embalaje */
  packingIndicator: string;
  /** Contenido del paquete */
  packageContents: PackageContents;
}

/**
 * Dirección del destinatario
 */
export interface Addressee {
  /** Nombre del destinatario */
  name: string;
  /** Primer apellido */
  lastName1: string;
  /** Segundo apellido */
  lastName2: string;
  /** Tipo de documento de identidad */
  doiType: string;
  /** Número de documento de identidad */
  doiNumber: string;
  /** Nombre de la empresa */
  company: string;
  /** Persona de contacto */
  contactPerson: string;
  /** Tipo de dirección: CL=Calle, AV=Avenida, etc. */
  addressType: string;
  /** Dirección */
  address: string;
  /** Número */
  number: string;
  /** Portal */
  portal: string;
  /** Bloque */
  block: string;
  /** Escalera */
  staircase: string;
  /** Piso */
  floor: string;
  /** Puerta */
  door: string;
  /** Complemento de dirección */
  addressComplement: string;
  /** Localidad */
  locality: string;
  /** Código de provincia (2 dígitos) */
  province: string;
  /** Código postal */
  cp: string;
  /** Código ZIP (para envíos internacionales) */
  zip: string;
  /** Código de país (ISO 3166-1 alpha-3) */
  country: string;
  /** Teléfono de contacto */
  contactPhone: string;
  /** Email */
  email: string;
  /** Número de SMS */
  smsNumber: string;
  /** Idioma: spa, cat, eng, etc. */
  language: string;
  /** Código de oficina elegida */
  chosenOffice: string;
  /** Código Homepaq */
  homepaqCode: string;
}

/**
 * Dirección del remitente
 */
export interface Sender {
  /** Nombre del remitente */
  name: string;
  /** Primer apellido */
  lastName1: string;
  /** Segundo apellido */
  lastName2: string;
  /** Tipo de documento de identidad */
  doiType: string;
  /** Número de documento de identidad (CIF/NIF) */
  doiNumber: string;
  /** Nombre de la empresa */
  company: string;
  /** Persona de contacto */
  contactPerson: string;
  /** Tipo de dirección: CL=Calle, AV=Avenida, etc. */
  addressType: string;
  /** Dirección */
  address: string;
  /** Número */
  number: string;
  /** Portal */
  portal: string;
  /** Bloque */
  block: string;
  /** Escalera */
  staircase: string;
  /** Piso */
  floor: string;
  /** Puerta */
  door: string;
  /** Complemento de dirección */
  addressComplement: string;
  /** Localidad */
  locality: string;
  /** Código de provincia (2 dígitos) */
  province: string;
  /** Código postal */
  cp: string;
  /** Código ZIP (para envíos internacionales) */
  zip: string;
  /** Código de país (ISO 3166-1 alpha-3) */
  country: string;
  /** Teléfono de contacto */
  contactPhone: string;
  /** Email */
  email: string;
  /** Número de SMS */
  smsNumber: string;
  /** Idioma: spa, cat, eng, etc. */
  language: string;
  /** Código de oficina elegida */
  chosenOffice: string;
  /** Código Homepaq */
  homepaqCode: string;
}

/**
 * Información de cada envío
 */
export interface Shipment {
  /** Provincia de admisión (código de 2 dígitos) */
  admissionProvince: string;
  /** Número de paquetes */
  packagesNumber: string;
  /** Código de producto (ej: PAFXB) */
  product: string;
  /** Método de entrega (ej: DOUAOF) */
  deliveryMethod: string;
  /** Código de manifiesto */
  manifestCode: string;
  /** Peso total en gramos */
  totalWeight: string;
  /** Longitud total */
  totalLength: string;
  /** Ancho total */
  totalWidth: string;
  /** Alto total */
  totalHigh: string;
  /** Número de contrato */
  contractNumber: string;
  /** Número de cliente */
  clientNumber: string;
  /** Código de etiquetador */
  labellerCode: string;
  /** Metros cúbicos totales */
  totalCubicMeters: string;
  /** Primera referencia del envío */
  shipmentReference1: string;
  /** Segunda referencia del envío */
  shipmentReference2: string;
  /** Tercera referencia del envío */
  shipmentReference3: string;
  /** Notas del envío */
  shipmentNotes: string;
  /** Fecha de expiración */
  dateExpiry: string;
  /** Tipo de modificación */
  modificationType: string;
  /** Lista de paquetes */
  packages: Package[];
  /** Destinatario */
  addressee: Addressee;
  /** Remitente */
  sender: Sender;
}

/**
 * DTO principal para el pre-registro de envíos en Correos
 */
export interface PreregisterDto {
  /** Código de idioma para mensajes de error: spa, cat, eng, etc. */
  errorCodeLanguage: string;
  /** Lista de envíos a pre-registrar */
  shipments: Shipment[];
}
