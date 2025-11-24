import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { OrderService } from "@medusajs/medusa/dist/services";

/**
 * Custom endpoint para listar órdenes con total recalculado
 * GET /admin/orders
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const orderService: OrderService = req.scope.resolve("orderService");
  try {
    // Extraer parámetros de query
    const { expand, fields, offset = 0, limit = 15, ...filters } = req.query;

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

    // Obtener órdenes con paginación - SIN select para cargar todos los campos
    const [orders, count] = await orderService.listAndCount(filters, {
      relations,
      skip: Number(offset),
      take: Number(limit),
      order: { created_at: "DESC" },
    });

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
