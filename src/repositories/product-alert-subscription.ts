import { dataSource } from "@medusajs/medusa/dist/loaders/database";
import { ProductAlertSubscription } from "../models/product-alert-subscription";

const ProductAlertSubscriptionRepository = dataSource.getRepository(
  ProductAlertSubscription
);

export default ProductAlertSubscriptionRepository;
