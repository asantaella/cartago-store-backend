import { MedusaContainer, NotificationService } from "@medusajs/medusa";

export default async (container: MedusaContainer): Promise<void> => {
  const notificationService = container.resolve<NotificationService>(
    "notificationService"
  );
  notificationService.subscribe("order.placed", "receipt-notification");
  notificationService.subscribe("customer.created", "welcome-sender");
  notificationService.subscribe("customer.password_reset", "reset-password");
  notificationService.subscribe(
    "order.shipment_created",
    "shipment-notification"
  );
};
