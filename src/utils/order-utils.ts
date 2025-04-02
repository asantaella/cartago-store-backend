import { Order } from "@medusajs/medusa";
import { formatMoney } from "./format-utils";

/**
 * Obtiene el NIF/CIF del cliente desde los metadatos de la dirección
 * @param order - Pedido del que extraer el NIF/CIF
 * @returns NIF/CIF del cliente o undefined si no existe
 */
export const getCustomerNifCif = (order: Order): string | undefined => {
  if (!order) return undefined;

  return (
    (order?.shipping_address?.metadata?.nif_cif as string) ||
    (order?.billing_address?.metadata?.nif_cif as string)
  );
};

/**
 * Obtiene el nombre del método de envío del pedido
 * @param order - Pedido del que extraer el método de envío
 * @returns Nombre del método de envío o cadena vacía si no existe
 */
export const getShippingMethodName = (order: Order): string => {
  if (!order || !order.shipping_methods) return "";

  return order.shipping_methods.length
    ? order.shipping_methods[0].shipping_option?.name || ""
    : "";
};

/**
 * Genera una línea CSV para el método de envío
 * @param order - Pedido del que extraer el método de envío
 * @returns Cadena CSV con los datos del método de envío
 */
export const buildShippingMethodCsv = (order: Order): string => {
  if (!order || !order.shipping_methods || !order.shipping_methods.length) {
    return ";;;;;;;;";
  }
  const currencyCode = order.currency_code || "EUR";
  const taxRate = order.region?.tax_rate || 0;

  const shippingMethod = order.shipping_methods[0];
  const shippingMethodName = shippingMethod?.shipping_option?.name || "";
  const shippingTotal = formatMoney(
    shippingMethod?.price || 0,
    currencyCode
  );
  const discountTotal = formatMoney(0, currencyCode);
  const shippingSubtotal = formatMoney(
    shippingMethod?.price / (1 + taxRate / 100) || 0,
    currencyCode
  );

  return `${shippingMethodName};;1;${shippingSubtotal};${shippingTotal};${shippingSubtotal};${discountTotal};${shippingTotal};;`;
};
