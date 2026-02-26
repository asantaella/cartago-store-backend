import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { registerOverriddenValidators, validator } from "@medusajs/medusa";
import { AdminGetCustomersParams } from "@medusajs/medusa/dist/api/routes/admin/customers/list-customers";
import { CustomerRepository } from "@medusajs/medusa/dist/repositories/customer";
import { buildQuery } from "@medusajs/utils";
import { isDefined } from "medusa-core-utils";
import { omit, pickBy } from "lodash";
import { In, ILike } from "typeorm";
import { IsOptional, IsString } from "class-validator";

class AdminGetCustomersParamsWithPhone extends AdminGetCustomersParams {
  @IsOptional()
  @IsString()
  phone?: string;
}

registerOverriddenValidators(AdminGetCustomersParamsWithPhone);

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const validatedQuery = await validator(
    AdminGetCustomersParamsWithPhone,
    req.query
  );

  const expandFields = validatedQuery.expand
    ? validatedQuery.expand.split(",")
    : [];

  const defaultOrder: Record<string, "ASC" | "DESC"> = {
    updated_at: "DESC",
  };
  let orderBy: Record<string, "ASC" | "DESC"> | undefined = defaultOrder;
  if (validatedQuery.order) {
    const order = validatedQuery.order;
    const direction = order.startsWith("-") ? "DESC" : "ASC";
    const field = order.replace(/^-/, "");
    orderBy = { [field]: direction };
  }

  const listConfig = {
    relations: expandFields,
    skip: validatedQuery.offset,
    take: validatedQuery.limit,
    order: orderBy,
  };

  const filterableFields = omit(validatedQuery, [
    "limit",
    "offset",
    "expand",
    "fields",
    "order",
  ]);

  const q = typeof filterableFields.q === "string" ? filterableFields.q : "";
  const phone =
    typeof filterableFields.phone === "string" ? filterableFields.phone : "";

  delete filterableFields.q;
  delete filterableFields.phone;

  const query = buildQuery(
    pickBy(filterableFields, (value) => isDefined(value)),
    listConfig
  ) as any;

  if (!query.order || Object.keys(query.order).length === 0) {
    query.order = { updated_at: "DESC" };
  }

  if (query.where?.groups) {
    query.relations = query.relations ?? {};
    query.relations.groups = query.relations.groups ?? true;
    query.where.groups = {
      id: In(query.where.groups.value),
    };
  }

  const trimmedQ = q.trim();
  const trimmedPhone = phone.trim();

  if (trimmedQ) {
    const qLike = ILike(`%${trimmedQ}%`);
    const baseWhere = Array.isArray(query.where)
      ? query.where[0]
      : query.where ?? {};

    delete baseWhere.email;
    delete baseWhere.first_name;
    delete baseWhere.last_name;

    query.where = [
      { ...baseWhere, email: qLike },
      { ...baseWhere, first_name: qLike },
      { ...baseWhere, last_name: qLike },
      { ...baseWhere, phone: qLike },
    ];
  }

  if (trimmedPhone) {
    const phoneLike = ILike(`%${trimmedPhone}%`);
    if (Array.isArray(query.where)) {
      query.where = query.where.map((whereItem) => ({
        ...whereItem,
        phone: phoneLike,
      }));
    } else {
      query.where = { ...(query.where ?? {}), phone: phoneLike };
    }
  }

  const manager = req.scope.resolve("manager");
  const customerRepo = manager.withRepository(CustomerRepository);

  const [customers, count] = await Promise.all([
    customerRepo.find(query),
    customerRepo.count(query),
  ]);

  res.status(200).json({
    customers,
    count,
    offset: validatedQuery.offset,
    limit: validatedQuery.limit,
  });
}
