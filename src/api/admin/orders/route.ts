import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { Order } from "@medusajs/medusa/dist/models";
import { OrderService } from "@medusajs/medusa/dist/services";
import { buildQuery } from "@medusajs/medusa/dist/utils/build-query";
import { FindOperator, ILike, IsNull, Not, Raw } from "typeorm";

/**
 * Custom endpoint para listar órdenes con total recalculado
 * GET /admin/orders
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const orderService: OrderService = req.scope.resolve("orderService");
  const manager = req.scope.resolve("manager");
  const orderRepo = manager.getRepository(Order);
  try {
    // Extraer parámetros de query
    const { expand, fields, offset = 0, limit = 15, phone, first_name, last_name, ...filters } = req.query;
    const phoneFilter = Array.isArray(phone) ? phone[0] : phone;
    const firstNameFilter = Array.isArray(first_name) ? first_name[0] : first_name;
    const lastNameFilter = Array.isArray(last_name) ? last_name[0] : last_name;

    // Preparar las relaciones a expandir
    const relations = expand
      ? (expand as string).split(",")
      : [
          "customer",
          "shipping_address",
          "sales_channel",
          "items",
          "shipping_methods",
          "discounts",
          "discounts.rule",
        ];

    // Preparar los campos a seleccionar
    const select = fields
      ? (fields as string).split(",")
      : [
          "id",
          "status",
          "display_id",
          "created_at",
          "email",
          "fulfillment_status",
          "payment_status",
          "total",
          "shipping_total",
          "currency_code",
        ];

    const selector = { ...filters };
    const qValue = selector.q
      ? Array.isArray(selector.q)
        ? selector.q[0]
        : selector.q
      : undefined;
    if (selector.q) {
      delete selector.q;
    }

    const ensureRelation = (relation: string) => {
      if (!relations.includes(relation)) {
        relations.push(relation);
      }
    };

    if (qValue || phoneFilter || firstNameFilter || lastNameFilter) {
      ensureRelation("shipping_address");
      ensureRelation("customer");
    }

    const config: any = {
      relations,
      skip: Number(offset),
      take: Number(limit),
      order: { created_at: "DESC" },
    };

    const query = buildQuery(selector, config);
    const innerJoinLikeConstraints = {
      shipping_address: {
        id: Not(IsNull()),
      },
      customer: {
        id: Not(IsNull()),
      },
    };

    if (qValue) {
      const qValueStr = String(qValue);
      const qLike = `%${qValueStr}%`;
      const baseWhere: any = { ...(query.where ?? {}) };
      delete baseWhere.display_id;
      delete baseWhere.email;

      const searchConditions: any[] = [
        mergeConstraints(baseWhere, {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            first_name: normalizedILike(qValueStr),
          },
        }),
        mergeConstraints(baseWhere, {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            last_name: normalizedILike(qValueStr),
          },
        }),
        mergeConstraints(baseWhere, {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            phone: Raw(
              (alias) =>
                `REPLACE(${alias}, ' ', '') ILIKE REPLACE(:phoneVal, ' ', '')`,
              { phoneVal: `%${qValueStr}%` }
            ),
          },
        }),
        mergeConstraints(baseWhere, {
          email: ILike(qLike),
        }),
        mergeConstraints(baseWhere, {
          display_id: Raw(
            (alias) => `CAST(${alias} as varchar) ILike :q`,
            {
              q: qLike,
            }
          ),
        }),
        mergeConstraints(baseWhere, {
          customer: {
            ...innerJoinLikeConstraints.customer,
            first_name: normalizedILike(qValueStr),
          },
        }),
        mergeConstraints(baseWhere, {
          customer: {
            ...innerJoinLikeConstraints.customer,
            last_name: normalizedILike(qValueStr),
          },
        }),
        mergeConstraints(baseWhere, {
          customer: {
            ...innerJoinLikeConstraints.customer,
            phone: Raw(
              (alias) =>
                `REPLACE(${alias}, ' ', '') ILIKE REPLACE(:phoneVal2, ' ', '')`,
              { phoneVal2: `%${qValueStr}%` }
            ),
          },
        }),
      ];

      // Si hay múltiples palabras, agregar búsqueda de nombre completo
      const words = qValueStr.trim().split(/\s+/);
      if (words.length >= 2) {
        // Buscar first_name con primera palabra Y last_name con segunda
        searchConditions.push(
          mergeConstraints(baseWhere, {
            shipping_address: {
              ...innerJoinLikeConstraints.shipping_address,
              first_name: normalizedILike(words[0]),
              last_name: normalizedILike(words[1]),
            },
          }),
          mergeConstraints(baseWhere, {
            customer: {
              ...innerJoinLikeConstraints.customer,
              first_name: normalizedILike(words[0]),
              last_name: normalizedILike(words[1]),
            },
          })
        );

        // Buscar todas las palabras en last_name
        if (words.length > 2) {
          const lastNamePart = words.slice(1).join(' ');
          searchConditions.push(
            mergeConstraints(baseWhere, {
              shipping_address: {
                ...innerJoinLikeConstraints.shipping_address,
                first_name: normalizedILike(words[0]),
                last_name: normalizedILike(lastNamePart),
              },
            }),
            mergeConstraints(baseWhere, {
              customer: {
                ...innerJoinLikeConstraints.customer,
                first_name: normalizedILike(words[0]),
                last_name: normalizedILike(lastNamePart),
              },
            })
          );
        }
      }

      query.where = searchConditions;
    }

    if (phoneFilter) {
      // Filtrar sólo por shipping_address.phone (eliminar espacios antes de comparar)
      const phoneVal = String(phoneFilter).replace(/\s+/g, "");
      const phoneConstraints = [
        {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            phone: Raw(
              (alias) =>
                `REPLACE(${alias}, ' ', '') ILIKE REPLACE(:phoneVal, ' ', '')`,
              { phoneVal: `%${phoneVal}%` }
            ),
          },
        },
      ];

      const baseConditions = Array.isArray(query.where)
        ? query.where
        : [query.where ?? {}];

      query.where = baseConditions.flatMap((condition) =>
        phoneConstraints.map((constraint) =>
          mergeConstraints(condition ?? {}, constraint)
        )
      );
    }

    if (firstNameFilter || lastNameFilter) {
      // Filtrar por first_name y/o last_name con normalización (sin tildes ni espacios)
      // Soporta búsquedas de nombre completo ej: "ruben o" busca en ambos campos
      const baseConditions = Array.isArray(query.where)
        ? query.where
        : [query.where ?? {}];

      // Crear constrains para shipping_address y customer
      const nameConstraints = buildNameConstraints(
        firstNameFilter,
        lastNameFilter,
        innerJoinLikeConstraints
      );

      query.where = baseConditions.flatMap((condition) =>
        nameConstraints.map((constraint) =>
          mergeConstraints(condition ?? {}, constraint)
        )
      );
    }

    const rels = query.relations ?? {};
    const countQuery = { ...query };
    countQuery.relations = rels;
    countQuery.relationLoadStrategy = "join";

    // Obtener órdenes con paginación - SIN select para cargar todos los campos
    let orders = await orderRepo.find({
      ...query,
      relations: rels,
      relationLoadStrategy: "join",
    });
    const count = await orderRepo.count(countQuery);

    // Ordenar por relevancia si hay búsqueda de texto
    if (qValue) {
      const qValueStr = String(qValue);
      orders = sortByRelevance(orders, qValueStr);
    }

    // Recalcular el total para cada orden usando retrieveWithTotals
    const ordersWithRecalculatedTotal = await Promise.all(
      orders.map(async (order) => {
        // Usar retrieveWithTotals para obtener los totales calculados correctamente
        const orderWithTotals = await orderService.retrieveWithTotals(
          order.id,
          {
            relations,
          }
        );

        const { total: recalculatedTotal, shippingTotal } =
          calculateOrderTotal(orderWithTotals);

        // Mantener solo los campos solicitados en el select si se especificaron
        let orderResponse: any = orderWithTotals;
        if (fields) {
          orderResponse = {};
          (select as string[]).forEach((field) => {
            orderResponse[field] = orderWithTotals[field];
          });
          // Siempre incluir las relaciones solicitadas
          relations.forEach((relation) => {
            if (orderWithTotals[relation]) {
              orderResponse[relation] = orderWithTotals[relation];
            }
          });
        }

        return {
          ...orderResponse,
          total: recalculatedTotal,
          shipping_total: shippingTotal, // Actualizar shipping_total
          original_total: orderWithTotals.total, // Guardar el total original para referencia
        };
      })
    );
    return res.status(200).json({
      orders: ordersWithRecalculatedTotal,
      count,
      offset: Number(offset),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("Error al obtener órdenes:", error);
    return res.status(500).json({
      message: "Error al obtener las órdenes",
      error: error.message,
    });
  }
};

/**
 * Ordena las órdenes por relevancia basándose en la búsqueda
 * Prioriza coincidencias más precisas (nombre completo > parcial)
 */
function sortByRelevance(orders: Order[], searchTerm: string): Order[] {
  const words = searchTerm.trim().split(/\s+/);
  const hasMultipleWords = words.length >= 2;

  // Si no hay múltiples palabras, no reordenar (mantener orden por fecha)
  if (!hasMultipleWords) {
    return orders;
  }

  const firstWord = removeAccents(words[0]).toLowerCase();
  const secondWord = removeAccents(words.slice(1).join(' ')).toLowerCase();

  // Calcular score para cada orden
  const ordersWithScore = orders.map((order) => {
    let score = 0;

    // Obtener nombres normalizados de shipping_address y customer
    const saFirstName = order.shipping_address?.first_name
      ? removeAccents(order.shipping_address.first_name).toLowerCase()
      : '';
    const saLastName = order.shipping_address?.last_name
      ? removeAccents(order.shipping_address.last_name).toLowerCase()
      : '';
    const custFirstName = order.customer?.first_name
      ? removeAccents(order.customer.first_name).toLowerCase()
      : '';
    const custLastName = order.customer?.last_name
      ? removeAccents(order.customer.last_name).toLowerCase()
      : '';

    // Score 1000: Coincidencia exacta de nombre completo (first_name + last_name)
    if (
      (saFirstName === firstWord && saLastName === secondWord) ||
      (custFirstName === firstWord && custLastName === secondWord)
    ) {
      score = 1000;
    }
    // Score 500: first_name contiene primera palabra Y last_name contiene segunda
    else if (
      (saFirstName.includes(firstWord) && saLastName.includes(secondWord)) ||
      (custFirstName.includes(firstWord) && custLastName.includes(secondWord))
    ) {
      score = 500;
    }
    // Score 300: first_name empieza con primera palabra Y last_name empieza con segunda
    else if (
      (saFirstName.startsWith(firstWord) && saLastName.startsWith(secondWord)) ||
      (custFirstName.startsWith(firstWord) && custLastName.startsWith(secondWord))
    ) {
      score = 300;
    }
    // Score 100: first_name contiene primera palabra
    else if (saFirstName.includes(firstWord) || custFirstName.includes(firstWord)) {
      score = 100;
      // Bonus si last_name contiene algo de la segunda palabra
      if (saLastName.includes(secondWord) || custLastName.includes(secondWord)) {
        score += 50;
      }
    }
    // Score 80: last_name contiene segunda palabra
    else if (saLastName.includes(secondWord) || custLastName.includes(secondWord)) {
      score = 80;
    }
    // Score 50: Coincide el término completo en algún campo
    else {
      const fullTerm = removeAccents(searchTerm).toLowerCase();
      if (
        saFirstName.includes(fullTerm) ||
        saLastName.includes(fullTerm) ||
        custFirstName.includes(fullTerm) ||
        custLastName.includes(fullTerm)
      ) {
        score = 50;
      } else {
        score = 10; // Coincidió en otro campo (email, phone, etc)
      }
    }

    return { order, score };
  });

  // Ordenar por score DESC (mayor relevancia primero), luego por created_at DESC
  ordersWithScore.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Si tienen mismo score, ordenar por fecha
    return new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime();
  });

  return ordersWithScore.map((item) => item.order);
}

/**
 * Construye constraines para búsquedas flexibles de nombre/apellido.
 * Soporta búsqueda de nombre completo dividiendo palabras:
 * - "ruben" → busca en first_name
 * - "ruben o" → busca first_name:ruben AND last_name:o (combinación)
 */
function buildNameConstraints(
  firstNameFilter: any,
  lastNameFilter: any,
  innerJoinLikeConstraints: any
) {
  const constraints: any[] = [];

  if (firstNameFilter && !lastNameFilter) {
    const fname = String(firstNameFilter).trim();
    const words = fname.split(/\s+/);

    if (words.length === 1) {
      // Búsqueda simple por first_name
      constraints.push(
        {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            first_name: normalizedILike(fname),
          },
        },
        {
          customer: {
            ...innerJoinLikeConstraints.customer,
            first_name: normalizedILike(fname),
          },
        }
      );
    } else {
      // Múltiples palabras: primera palabra en first_name Y resto en last_name
      const firstWord = words[0];
      const restWords = words.slice(1).join(' ');

      constraints.push(
        {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            first_name: normalizedILike(firstWord),
            last_name: normalizedILike(restWords),
          },
        },
        {
          customer: {
            ...innerJoinLikeConstraints.customer,
            first_name: normalizedILike(firstWord),
            last_name: normalizedILike(restWords),
          },
        }
      );

      // También buscar todo el texto en first_name
      constraints.push(
        {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            first_name: normalizedILike(fname),
          },
        },
        {
          customer: {
            ...innerJoinLikeConstraints.customer,
            first_name: normalizedILike(fname),
          },
        }
      );
    }
  } else if (lastNameFilter && !firstNameFilter) {
    const lname = String(lastNameFilter).trim();
    const words = lname.split(/\s+/);

    if (words.length === 1) {
      // Búsqueda simple por last_name
      constraints.push(
        {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            last_name: normalizedILike(lname),
          },
        },
        {
          customer: {
            ...innerJoinLikeConstraints.customer,
            last_name: normalizedILike(lname),
          },
        }
      );
    } else {
      // Múltiples palabras: primera palabra en first_name Y resto en last_name
      const firstWord = words[0];
      const restWords = words.slice(1).join(' ');

      constraints.push(
        {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            first_name: normalizedILike(firstWord),
            last_name: normalizedILike(restWords),
          },
        },
        {
          customer: {
            ...innerJoinLikeConstraints.customer,
            first_name: normalizedILike(firstWord),
            last_name: normalizedILike(restWords),
          },
        }
      );

      // También buscar todo el texto en last_name
      constraints.push(
        {
          shipping_address: {
            ...innerJoinLikeConstraints.shipping_address,
            last_name: normalizedILike(lname),
          },
        },
        {
          customer: {
            ...innerJoinLikeConstraints.customer,
            last_name: normalizedILike(lname),
          },
        }
      );
    }
  } else if (firstNameFilter && lastNameFilter) {
    // Ambos parámetros: buscar first_name AND last_name
    const fname = String(firstNameFilter).trim();
    const lname = String(lastNameFilter).trim();

    constraints.push(
      {
        shipping_address: {
          ...innerJoinLikeConstraints.shipping_address,
          first_name: normalizedILike(fname),
          last_name: normalizedILike(lname),
        },
      },
      {
        customer: {
          ...innerJoinLikeConstraints.customer,
          first_name: normalizedILike(fname),
          last_name: normalizedILike(lname),
        },
      }
    );
  }

  return constraints;
}

/**
 * Remueve acentos y caracteres especiales de una cadena
 */
function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Aplica normalización para búsquedas tolerantes a tildes y espacios.
 * Usa normalización en JavaScript + SQL simple (no requiere extensiones).
 */
function normalizedILike(value: string): ReturnType<typeof Raw> {
  // Normalizar en JavaScript (remover tildes y espacios)
  const normalized = removeAccents(value).replace(/\s+/g, '');
  
  return Raw(
    (alias) =>
      `LOWER(REPLACE(TRANSLATE(${alias}, 'áéíóúàèìòùâêîôûãõäëïöüçñÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÄËÏÖÜÇÑ', 'aeiouaeiouaeiouaoaeiouccnAEIOUAEIOUAEIOUAOAEIOUCCN'), ' ', '')) ILIKE :nval`,
    { nval: `%${normalized}%` }
  );
}

function calculateOrderTotal(order: any): {
  total: number;
  shippingTotal: number;
} {
  const shippingTotal = order.shipping_total || 0;

  let _total = order.total;
  if (shippingTotal === 0) {
    _total -= order.shipping_tax_total;
  }

  return {
    total: _total,
    shippingTotal: Math.round(shippingTotal),
  };
}

// Combine nested where fragments without mutating the originals.
function mergeConstraints(base: any = {}, extra: any = {}): any {
  const merged: any = { ...base };
  Object.entries(extra).forEach(([key, value]) => {
    if (value instanceof FindOperator) {
      merged[key] = value;
      return;
    }
    if (isPlainObject(value)) {
      merged[key] = mergeConstraints(merged[key], value);
      return;
    }
    merged[key] = value;
  });
  return merged;
}

function isPlainObject(value: any): value is Record<string, unknown> {
  return value !== null && value?.constructor === Object;
}
