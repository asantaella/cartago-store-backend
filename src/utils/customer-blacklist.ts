export type CustomerBlacklistIdentity = {
  email?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown> | null;
  in_black_list?: boolean;
};

type OrderAddressIdentity = {
  phone?: string | null;
  country_code?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type OrderBlacklistIdentity = {
  email?: string | null;
  customer?: CustomerBlacklistIdentity | null;
  shipping_address?: OrderAddressIdentity | null;
  billing_address?: OrderAddressIdentity | null;
};

export const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizePhone = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\D/g, "") : "";

export const normalizeNifCif = (value: unknown): string =>
  typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";

const getNifCif = (address?: OrderAddressIdentity | null): string =>
  normalizeNifCif(address?.metadata?.nif_cif);

const phonesMatch = (
  orderPhone: unknown,
  customerPhone: unknown,
  countryCode?: string | null,
): boolean => {
  const normalizedOrderPhone = normalizePhone(orderPhone);
  const normalizedCustomerPhone = normalizePhone(customerPhone);

  if (!normalizedOrderPhone || !normalizedCustomerPhone) {
    return false;
  }

  if (normalizedOrderPhone === normalizedCustomerPhone) {
    return true;
  }

  if (countryCode?.toUpperCase() !== "ES") {
    return false;
  }

  const spanishLocalPhone = (phone: string): string =>
    phone.length === 11 && phone.startsWith("34") ? phone.slice(2) : phone;

  return (
    spanishLocalPhone(normalizedOrderPhone) ===
    spanishLocalPhone(normalizedCustomerPhone)
  );
};

const customerMatchesOrder = (
  order: OrderBlacklistIdentity,
  customer: CustomerBlacklistIdentity,
): boolean => {
  const orderEmail = normalizeEmail(order.email);
  const customerEmail = normalizeEmail(customer.email);
  if (orderEmail && customerEmail && orderEmail === customerEmail) {
    return true;
  }

  if (
    phonesMatch(
      order.shipping_address?.phone,
      customer.phone,
      order.shipping_address?.country_code,
    )
  ) {
    return true;
  }

  const customerNifCif = normalizeNifCif(customer.metadata?.nif_cif);
  if (!customerNifCif) {
    return false;
  }

  return (
    getNifCif(order.shipping_address) === customerNifCif ||
    getNifCif(order.billing_address) === customerNifCif
  );
};

export const isOrderInCustomerBlacklist = (
  order: OrderBlacklistIdentity,
  blacklistedCustomers: CustomerBlacklistIdentity[],
): boolean => {
  if (order.customer?.in_black_list === true) {
    return true;
  }

  return blacklistedCustomers.some((customer) =>
    customerMatchesOrder(order, customer),
  );
};
