import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInBlackListToCustomer1787776102177
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer"
      ADD COLUMN IF NOT EXISTS "in_black_list" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer"
      DROP COLUMN IF EXISTS "in_black_list"
    `);
  }
}
