import { Customer } from "@medusajs/medusa";

export type CustomerRequestPassword = Partial<Customer> & { token: string };
