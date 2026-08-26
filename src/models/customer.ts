import { Customer as MedusaCustomer } from "@medusajs/medusa";
import { Column, Entity } from "typeorm";

@Entity()
export class Customer extends MedusaCustomer {
  @Column({ type: "boolean", nullable: false, default: false })
  in_black_list: boolean;
}
