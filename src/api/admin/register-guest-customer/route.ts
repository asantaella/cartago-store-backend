import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { IsEmail, IsString } from "class-validator";
import { CustomerService, OrderService } from "@medusajs/medusa/dist/services";

/**
 * Definición del esquema de validación para la solicitud
 */
class AdminRegisterGuestRequest {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  first_name?: string;

  @IsString()
  last_name?: string;
}

const unlinkOrdersFromGuestCustomer = async ({
  scope,
  email,
  newCustomer,
}): Promise<void> => {
  const customerService: CustomerService = scope.resolve("customerService");
  const orderService: OrderService = scope.resolve("orderService");
  // Buscar si existe un cliente invitado con el mismo email
  const guestCustomers = await customerService.list({
    email,
    has_account: false,
  });

  if (guestCustomers.length > 0) {
    const guestCustomer = guestCustomers[0];

    // Reasignar las órdenes del cliente invitado al nuevo cliente registrado
    const orders = await orderService.list({ customer_id: guestCustomer.id });
    try {
      for (const order of orders) {
        console.log("Updating orders: ", order.id);
        await orderService.update(order.id, { customer_id: newCustomer.id });
      }

      // Opcional: eliminar el registro del cliente invitado
      console.log("Deleting guest user...", guestCustomer.id)
      await customerService.delete(guestCustomer.id);
    } catch (err) {
      throw new Error(err.toString());
    }
  }
};

/**
 * Handler para el método POST en /admin/register-guest
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { email, password, first_name, last_name } =
    req.body as AdminRegisterGuestRequest;

  const customerService: CustomerService = req.scope.resolve("customerService");
  const orderService: OrderService = req.scope.resolve("orderService");

  try {
    // Verificar si ya existe un cliente registrado con el mismo email
    const existingCustomers = await customerService.list({
      email,
      has_account: true,
    });

    if (existingCustomers.length > 0) {
      await unlinkOrdersFromGuestCustomer({
        scope: req.scope,
        email,
        newCustomer: existingCustomers[0],
      });
      return res.status(200).json({
        message: "Reasignado a cliente registrado con este correo electrónico.",
      });
    }

    console.log("Creating a new customer: ", email);

    // Crear un nuevo cliente registrado
    const newCustomer = await customerService.create({
      email,
      password,
      first_name,
      last_name,
      has_account: true,
    });

    await unlinkOrdersFromGuestCustomer({
      scope: req.scope,
      email,
      newCustomer,
    });

    return res.status(200).json({
      message: "Cliente registrado exitosamente.",
      // customer: newCustomer,
      customer: email,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al registrar el cliente." });
  }
};
