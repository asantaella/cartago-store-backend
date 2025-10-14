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
  // 1. Calcular subtotal de items
  const itemsSubtotal =
    order.items?.reduce((acc: number, item: any) => {
      return acc + item.total;
    }, 0) || 0;

  // 2. Calcular total de descuentos
  const discountTotal = order.discount_total || 0;

  // 3. Calcular total de envío desde shipping_methods
  // En Medusa, el campo 'price' del shipping_method ya incluye descuentos aplicados
  // (ej: si hay un descuento FREE_SHIPPING, price será 0)
  const shippingTotal =
    order.shipping_methods?.reduce((acc: number, method: any) => {
      const methodTotal =
        method.total !== undefined ? method.total : method.price || 0;
      return acc + methodTotal;
    }, 0) ||
    order.shipping_total ||
    0;

  // 4. Calcular impuestos
  const taxTotal = order.tax_total || 0;

  // 5. Calcular total de gift cards
  const giftCardTotal = order.gift_card_total || 0;

  // Total = Subtotal + Envío - Descuentos + Impuestos - Gift Cards
  const total = itemsSubtotal + shippingTotal - giftCardTotal;

  return {
    total: Math.max(0, Math.round(total)), 
    shippingTotal: Math.round(shippingTotal),
  };
}
