import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { IsBoolean, IsEmail, IsOptional, IsString, validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { CustomerService } from "@medusajs/medusa/dist/services";
import { transferOrdersFromGuestToCustomer } from "../../utils/transfer-guest-orders";

/**
 * Definición del esquema de validación para la solicitud
 */
class AdminRegisterGuestRequest {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsBoolean()
  delete_guest?: boolean = true;
}

/**
 * Handler para el método POST en /admin/register-guest
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  // Validar automáticamente el body
  const dto = plainToInstance(AdminRegisterGuestRequest, req.body);
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

  const { email, password, first_name, last_name, delete_guest } = dto;

  const customerService: CustomerService = req.scope.resolve("customerService");

  try {
    // Verificar si ya existe un cliente registrado con el mismo email
    const existingCustomers = await customerService.list({
      email,
      has_account: true,
    });

    if (existingCustomers.length > 0) {
      const result = await transferOrdersFromGuestToCustomer({
        scope: req.scope,
        email,
        newCustomerId: existingCustomers[0].id,
        deleteGuest: delete_guest ?? true,
      });

      return res.status(200).json({
        message: "Reasignado a cliente registrado con este correo electrónico.",
        orders_transferred: result.ordersTransferred,
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

    const result = await transferOrdersFromGuestToCustomer({
      scope: req.scope,
      email,
      newCustomerId: newCustomer.id,
      deleteGuest: delete_guest ?? true,
    });

    return res.status(200).json({
      message: "Cliente registrado exitosamente.",
      customer: email,
      orders_transferred: result.ordersTransferred,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error al registrar el cliente.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
