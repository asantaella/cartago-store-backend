import { MedusaContainer, NotificationService } from "@medusajs/medusa";

export default async (container: MedusaContainer): Promise<void> => {
  const notificationService = container.resolve<NotificationService>(
    "notificationService"
  );
  notificationService.subscribe("order.placed", "order-sender");
  notificationService.subscribe("customer.created", "welcome-sender");
};
