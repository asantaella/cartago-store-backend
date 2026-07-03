import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { IsEmail, validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { CustomerService } from "@medusajs/medusa/dist/services";
import { transferOrdersFromGuestToCustomer } from "../../utils/transfer-guest-orders";

/**
 * Validación para la solicitud de transferencia
 */
class TransferGuestOrdersRequest {
  @IsEmail()
  email: string;
}

/**
 * POST /admin/transfer-guest-orders
 *
 * Transfiere todas las órdenes existentes de un guest customer (has_account: false)
 * a un customer registrado (has_account: true) con el mismo email.
 *
 * A diferencia de /admin/register-guest-customer, este endpoint:
 * - No crea un nuevo customer si no existe el registered
 * - No requiere password
 * - No elimina el guest customer por defecto
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  // Validar automáticamente el body
  const dto = plainToInstance(TransferGuestOrdersRequest, req.body);
  const validationErrors = await validate(dto);
  if (validationErrors.length > 0) {
    return res.status(400).json({
      message: "Validation error",
      errors: validationErrors.map((err) => ({
        property: err.property,
        constraints: err.constraints,
      })),
    });
  }

  const { email } = dto;

  const customerService: CustomerService = req.scope.resolve("customerService");

  try {
    // 1. Buscar el customer registrado (debe existir)
    const registeredCustomers = await customerService.list({
      email,
      has_account: true,
    });

    if (registeredCustomers.length === 0) {
      return res.status(400).json({
        message:
          "No existe un cliente registrado con este correo electrónico. " +
          "Use /admin/register-guest-customer para registrar uno nuevo.",
      });
    }

    const registeredCustomer = registeredCustomers[0];

    // 2. Transferir órdenes del guest al registered (sin eliminar el guest)
    const result = await transferOrdersFromGuestToCustomer({
      scope: req.scope,
      email,
      newCustomerId: registeredCustomer.id,
      deleteGuest: false,
    });

    if (result.ordersTransferred === 0) {
      return res.status(404).json({
        message:
          "No se encontraron órdenes de guest para transferir con este correo electrónico.",
        guestCustomerId: result.guestCustomerId ?? null,
        orders_transferred: 0,
      });
    }

    return res.status(200).json({
      message: `Órdenes transferidas exitosamente al cliente registrado.`,
      customer: email,
      customer_id: registeredCustomer.id,
      orders_transferred: result.ordersTransferred,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error al transferir las órdenes del guest.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
