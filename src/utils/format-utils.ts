import { Address } from "@medusajs/medusa";

/**
 * Formatea un valor monetario a formato de moneda con el código de moneda especificado
 * @param amount - Cantidad en centavos
 * @param currency - Código de moneda (EUR, USD, etc.)
 * @returns Cadena formateada (ej: "10,99 €")
 */
export const formatMoney = (amount: number, currency: string): string => {
  if (!(typeof amount === "number") || !currency) {
    return "";
  }

  // Formatear el número
  const formatted = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency?.toUpperCase(),
  }).format(amount / 100);

  // Reemplazar cualquier espacio no separable (160) con un espacio normal (32)
  return formatted.replace(/\u00A0/g, " ");
};

/**
 * Formatea una fecha al formato español (dd/mm/yyyy)
 * @param date - Objeto Date a formatear
 * @returns Cadena formateada (ej: "15/5/2023")
 */
export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
};

/**
 * Formatea una dirección a formato de texto legible
 * @param address - Objeto Address a formatear
 * @returns Cadena formateada con la dirección completa
 */
export const formatAddress = (address: Address): string => {
  if (!address) {
    return "";
  }
  return `${address.address_1} ${address.address_2}, ${address.city}, ${address.province}, ${address.postal_code}`;
};
