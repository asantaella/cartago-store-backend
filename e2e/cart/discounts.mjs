export async function addDiscount(medusa, { cartId, discountCode }) {
  // Add discount to the cart
  const { cart } = await medusa.carts.update(cartId, {
    discounts: [{ code: discountCode }],
  });

  console.log(`Updated cart details:`, cart);
  console.log(`Applied discount code: ${discountCode}`);
  return cart;
}
