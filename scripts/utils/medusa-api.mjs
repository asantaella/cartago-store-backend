/**
 * Utilidades para interactuar con la API de MedusaJS.
 *
 * Proporciona helpers para crear carts, seleccionar payment sessions y verificar órdenes.
 */

import Medusa from "@medusajs/medusa-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../../.env") });

export const MEDUSA_BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

export function createMedusaClient() {
  return new Medusa({
    baseUrl: MEDUSA_BACKEND_URL,
    maxRetries: 3,
  });
}

export async function authenticateAdmin(medusa) {
  const email = process.env.ADMIN_EMAIL || "admin@medusa-test.com";
  const password = process.env.ADMIN_PASSWORD || "supersecret";

  await medusa.admin.auth.getToken({ email, password });
  console.log(`✓ Autenticado como ${email}`);
  return true;
}

export async function createCart(medusa, data) {
  const { cart } = await medusa.carts.create({
    region_id: data.region_id,
    items: data.items,
    sales_channel_id: data.sales_channel_id,
    context: data.context,
  });

  console.log(`✓ Cart creado: ${cart.id}`);
  return cart;
}

export async function updateCart(medusa, cartId, data) {
  const { cart } = await medusa.carts.update(cartId, {
    email: data.email,
    shipping_address: data.shipping_address,
    billing_address: data.billing_address,
  });

  console.log(`✓ Cart actualizado: ${cartId}`);
  return cart;
}

export async function listShippingOptions(medusa, cartId) {
  const { shipping_options } =
    await medusa.shippingOptions.listCartOptions(cartId);
  console.log(`✓ ${shipping_options.length} opciones de envío disponibles`);
  return shipping_options;
}

export async function addShippingMethod(medusa, cartId, optionId) {
  const { cart } = await medusa.carts.addShippingMethod(cartId, {
    option_id: optionId,
  });

  console.log(`✓ Método de envío aplicado: ${optionId}`);
  return cart;
}

export async function createPaymentSessions(medusa, cartId) {
  const { cart } = await medusa.carts.createPaymentSessions(cartId);
  console.log(
    `✓ Payment sessions creadas: ${cart.payment_sessions?.length || 0}`,
  );
  return cart;
}

export async function setPaymentSession(medusa, cartId, providerId) {
  const { cart } = await medusa.carts.setPaymentSession(cartId, {
    provider_id: providerId,
  });
  console.log(`✓ Payment provider seleccionado: ${providerId}`);
  return cart;
}

export async function completeCart(medusa, cartId) {
  const response = await medusa.carts.complete(cartId);

  if (response.type === "order") {
    const order = response.data;
    console.log(`✓ Orden creada: ${order.id}`);
    return order;
  }

  console.warn("✗ El carrito no se completó, revisar estado");
  return response.data;
}

export async function getOrder(medusa, orderId) {
  const { order } = await medusa.orders.retrieve(orderId);
  return order;
}

export async function loadCartMock() {
  const mockPath = join(__dirname, "../__mocks__/cart-mock.json");
  const { default: mock } = await import(mockPath, {
    assert: { type: "json" },
  });
  return mock;
}

export function logOrder(order) {
  console.log("\n=== Estado de Orden ===");
  console.log(`ID: ${order.id}`);
  console.log(`Status: ${order.status}`);
  console.log(`Payment Status: ${order.payment_status}`);
  console.log(`Total: ${order.total / 100} ${order.currency_code}`);
  console.log("======================\n");
}

export function logCart(cart) {
  console.log("\n=== Estado del Cart ===");
  console.log(`ID: ${cart.id}`);
  console.log(`Total: ${cart.total / 100} ${cart.region?.currency_code}`);
  console.log(`Payment Sessions: ${cart.payment_sessions?.length || 0}`);
  console.log("====================\n");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Alias para compatibilidad
export const wait = sleep;

// Helpers adicionales para tests
export async function loginAdmin(medusa, email, password) {
  await medusa.admin.auth.getToken({ email, password });
  return true;
}

export async function updateCartAddresses(medusa, cartId, addresses) {
  const { cart } = await medusa.carts.update(cartId, addresses);
  return cart;
}

export async function selectPayPalPayment(medusa, cartId) {
  const { cart } = await medusa.carts.setPaymentSession(cartId, {
    provider_id: "paypal",
  });
  return cart;
}

// Logging utilities
export function logSuccess(message) {
  console.log(`\x1b[32m${message}\x1b[0m`); // Green
}

export function logError(message) {
  console.error(`\x1b[31m${message}\x1b[0m`); // Red
}

export function logInfo(message) {
  console.log(`\x1b[36m${message}\x1b[0m`); // Cyan
}

export function logWarning(message) {
  console.warn(`\x1b[33m${message}\x1b[0m`); // Yellow
}
