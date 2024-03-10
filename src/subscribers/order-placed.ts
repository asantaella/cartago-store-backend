import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";
//import SendGrid from "@sendgrid/mail";
//import sendGridService from "medusa-plugin-sendgrid/services/sendgrid";
export default async function handleOrderPlaced({
  data,
  eventName,
  container,
  pluginOptions,
}: SubscriberArgs<Record<string, string>>) {

  const sendGridService = container.resolve("sendgridService");
  const orderService: OrderService = container.resolve("orderService");
  const order = await orderService.retrieve(data.id, {
    relations: ["items", "customer", "shipping_address"],
  });

  const notificationOrder = await sendGridService.fetchData(
    "order.placed",
    order
  );
  

  // await sendGridService.sendEmail(sendOptions).catch((error) => {
  //   this.logger_.error(error);
  // });

}

export const config: SubscriberConfig = {
  event: OrderService.Events.REFUND_FAILED,
  context: {
    subscriberId: "order-placed-handler",
  },
};
