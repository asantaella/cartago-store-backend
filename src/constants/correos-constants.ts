/**
 * Constantes para la integración con la API de Correos
 * Valores estáticos utilizados en el pre-registro de envíos
 */

/**
 * Constantes de configuración del envío
 */
export const CORREOS_SHIPMENT_CONSTANTS = {
  /** Idioma para los códigos de error */
  ERROR_CODE_LANGUAGE: "spa",

  /** Número de paquetes por defecto */
  PACKAGES_NUMBER: "1",

  /** Tipo de modificación: 1=Alta */
  MODIFICATION_TYPE: "1",
} as const;

/**
 * Constantes de configuración del paquete
 */
export const CORREOS_PACKAGE_CONSTANTS = {
  /** Dimensiones por defecto del paquete (en mm) */
  DEFAULT_HEIGHT: "150",
  DEFAULT_WIDTH: "100",
  DEFAULT_LENGTH: "100",
} as const;

/**
 * Constantes de contenido del paquete y aduanas
 */
export const CORREOS_PACKAGE_CONTENTS_CONSTANTS = {
  /** Tipo de envío: 1=Documentos, 2=Mercancías, 3=Devolución, 4=Regalo */
  SHIPMENT_TYPE: "2", // Mercancías

  /** Instrucciones de no entrega: D=Devolver */
  INSTRUCTIONS_DO_NOT_DELIVER: "D",
} as const;

/**
 * Constantes de datos aduaneros
 */
export const CORREOS_CUSTOMS_DATA_CONSTANTS = {
  /** País de origen por defecto: España */
  COUNTRY_ORIGIN: "ESP",
} as const;

/**
 * Constantes del destinatario
 */
export const CORREOS_ADDRESSEE_CONSTANTS = {
  /** Código de país por defecto: España */
  COUNTRY: "ESP",

  /** Idioma por defecto: Español */
  LANGUAGE: "spa",
} as const;

/**
 * Constantes del remitente - Accesorios Cartago SLU
 */
export const CORREOS_SENDER_CONSTANTS = {
  /** Nombre del remitente */
  NAME: "",

  /** Primer apellido */
  LAST_NAME_1: "",

  /** Segundo apellido */
  LAST_NAME_2: "",

  /** Tipo de documento: 2=CIF */
  DOI_TYPE: "2",

  /** CIF de la empresa */
  DOI_NUMBER: "B75682930",

  /** Nombre de la empresa */
  COMPANY: "ACCESORIOS CARTAGO SLU",

  /** Persona de contacto */
  CONTACT_PERSON: "",

  /** Tipo de dirección: CL=Calle */
  ADDRESS_TYPE: "CL",

  /** Dirección */
  ADDRESS: "Alameda de San Antón",

  /** Número */
  NUMBER: "23",

  /** Complemento de dirección */
  ADDRESS_COMPLEMENT: "Apartado de Correos 5085",

  /** Localidad */
  LOCALITY: "Cartagena",

  /** Código de provincia: 30=Murcia */
  PROVINCE: "30",

  /** Código postal */
  CP: "30394",

  /** Código de país: España */
  COUNTRY: "ESP",

  /** Teléfono de contacto */
  CONTACT_PHONE: "651513391",

  /** Email */
  EMAIL: "contacto@cartago4x4.es",

  /** Idioma: Español */
  LANGUAGE: "spa",
} as const;


export const CORREOS_PRINT_LABEL_CONSTANTS = {
  /** Tipo de impresión: PDF */
  APPLICATION: "ACCESORIOS_CARTAGO",
  DOCUMENTATION_TYPE: 1,
  LABEL_ORDER_TYPE: 1,
  LABEL_FORMAT: 2,
  LABEL_PRINT_MODE: 1,
  LABEL_PRINT_INITIAL_POSITION: 1
} as const;