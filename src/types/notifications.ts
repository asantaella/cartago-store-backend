import { Order, ShippingMethod } from "@medusajs/medusa";

export type NotificationSender = {
  Sender_Name: string;
  Sender_Address: string;
  Sender_Zip: string;
  Sender_City: string;
  Sender_State: string;
};

export type NotificationOrder = Partial<Order> & {
  date: Date;
  dateFormat: string;
  subtotal_ex_tax: string;
  shipping_method: ShippingMethod;
};

export type NotificationContent = NotificationSender & NotificationOrder;
