import { BaseEntity } from "@medusajs/medusa";
import { Column, Entity } from "typeorm";

/**
 * Singleton entity that stores the global invoice counter.
 * Only one row exists with id = "invoice_global".
 * Use InvoiceNumberGeneratorService to increment atomically.
 */
@Entity()
export class InvoiceCounter extends BaseEntity {
  @Column({ type: "int", default: 0 })
  counter: number;

  @Column({ type: "date", nullable: true })
  last_summary_sent_date: string | null;
}
