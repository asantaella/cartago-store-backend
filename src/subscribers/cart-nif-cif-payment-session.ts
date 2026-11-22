import type { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa";
import { isNifCifMissingForCart } from "../utils/nif-cif-requirement";

type CartUpdatedData = { id?: string };

/**
 * Releases the selected payment session when a cart update (address change,
 * new items, etc.) leaves a EUR cart of €400 or more without NIF/CIF.
 *
 * Medusa refreshes payment sessions in-process on cart updates, bypassing the
 * selection middleware, so a session selected while the cart was compliant
 * would otherwise stay payable. Deleting it forces the customer back through
 * payment-session selection, where `requireNifCifOnPaymentSession` applies.
 *
 * Only `pending` sessions are released: an authorized session means a payment
 * is already in flight, and this guard never acts after payment.
 */
export async function releasePaymentSessionWithoutNifCif({
  data,
  container,
}: Pick<SubscriberArgs<CartUpdatedData>, "data" | "container">): Promise<void> {
  const cartId = data?.id;
  if (!cartId) return;

  try {
    const cartService = container.resolve("cartService") as any;
    const cart = await cartService.retrieveWithTotals(cartId, {
      relations: ["region", "shipping_address", "billing_address", "payment_session"],
    });

    const session = cart?.payment_session;
    if (!session || session.status !== "pending") return;
    if (!isNifCifMissingForCart(cart)) return;

    await cartService.deletePaymentSession(cartId, session.provider_id);
    console.log(
      `[CART-NIF-CIF] Released ${session.provider_id} payment session on cart ${cartId}: NIF/CIF required`,
    );
  } catch (error) {
    console.error(
      `[CART-NIF-CIF] Failed to release payment session on cart ${cartId}:`,
      error,
    );
  }
}

export default async function handler(args: SubscriberArgs<CartUpdatedData>) {
  await releasePaymentSessionWithoutNifCif(args);
}

export const config: SubscriberConfig = {
  event: "cart.updated",
  context: {
    subscriberId: "cart-nif-cif-payment-session",
  },
};
