import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProductAlertSubscription1737628800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "product_alert_status_enum" AS ENUM ('pending', 'notified', 'cancelled')
    `);

    await queryRunner.query(`
      CREATE TABLE "product_alert_subscription" (
        "id" character varying NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "email" character varying NOT NULL,
        "variant_id" character varying NOT NULL,
        "status" "product_alert_status_enum" NOT NULL DEFAULT 'pending',
        "notified_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_product_alert_subscription" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_product_alert_email_variant" 
      ON "product_alert_subscription" ("email", "variant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_alert_variant_status" 
      ON "product_alert_subscription" ("variant_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_alert_variant_status"`);
    await queryRunner.query(`DROP INDEX "IDX_product_alert_email_variant"`);
    await queryRunner.query(`DROP TABLE "product_alert_subscription"`);
    await queryRunner.query(`DROP TYPE "product_alert_status_enum"`);
  }
}
