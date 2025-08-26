import { AwilixContainer } from "awilix";

/**
 * Simple loader to log CartService registration
 */
export default (
  container: AwilixContainer,
  config: Record<string, unknown>
): void => {
  console.log("[loader] Cart service loader executed");

  // Just log what's available, don't force registration
  const cartService = container.cradle.cartService;
  console.log("[loader] CartService available:", !!cartService);

  if (cartService) {
    console.log(
      "[loader] CartService constructor name:",
      cartService.constructor.name
    );
  }
};
