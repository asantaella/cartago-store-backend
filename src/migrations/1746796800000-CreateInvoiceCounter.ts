import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInvoiceCounter1746796800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "invoice_counter" (
        "id" character varying NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "counter" integer NOT NULL DEFAULT 0,
        "last_summary_sent_date" date NULL,
        CONSTRAINT "PK_invoice_counter" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `INSERT INTO "invoice_counter" ("id", "counter", "last_summary_sent_date") VALUES ('invoice_global', 0, NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invoice_counter"`);
  }
}
