import { ProductVariant as MedusaProductVariant } from "@medusajs/medusa";
import { Column, Entity } from "typeorm";

/**
 * Extiende ProductVariant de Medusa con el campo de recargo adicional de envío.
 * shipping_option_price_extra: importe en céntimos que se suma al precio del
 * método de envío seleccionado, multiplicado por la cantidad del item.
 * Regla: extra_total = SUM(variant.shipping_option_price_extra * item.quantity)
 */
@Entity()
export class ProductVariant extends MedusaProductVariant {
  @Column({ type: "integer", nullable: false, default: 0 })
  shipping_option_price_extra: number;

  @Column({ type: "varchar", length: 4, nullable: true })
  stock_location_code: string | null;
}
