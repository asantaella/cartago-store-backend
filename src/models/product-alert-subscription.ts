import { BaseEntity } from "@medusajs/medusa";
import { Column, Entity, Index } from "typeorm";

export enum ProductAlertStatus {
  PENDING = "pending",
  NOTIFIED = "notified",
  CANCELLED = "cancelled",
}

@Entity()
@Index(["email", "variant_id"], { unique: true })
export class ProductAlertSubscription extends BaseEntity {
  @Column({ type: "varchar" })
  email: string;

  @Column({ type: "varchar" })
  variant_id: string;

  @Column({
    type: "enum",
    enum: ProductAlertStatus,
    default: ProductAlertStatus.PENDING,
  })
  status: ProductAlertStatus;

  @Column({ type: "timestamp with time zone", nullable: true })
  notified_at: Date | null;
}
