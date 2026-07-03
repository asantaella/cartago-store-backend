import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { IsEmail, IsString } from "class-validator";
import { CustomerService, OrderService } from "@medusajs/medusa/dist/services";

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  const customerService: CustomerService = req.scope.resolve("customerService");

  try {
    // Verificar si ya existe un cliente registrado con el mismo email
    // Opcional: eliminar el registro del cliente invitado
    console.log("Deleting guest user...", id);
    await customerService.delete(id);
    return res.status(200).json({
      message: "Cliente borrado exitosamente.",
      // customer: newCustomer,
      customer: id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al registrar el cliente." });
  }
};
