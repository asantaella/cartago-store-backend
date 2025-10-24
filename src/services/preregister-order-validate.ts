import { OrderService, TransactionBaseService } from "@medusajs/medusa";
import { Product, ProductCategory } from "@medusajs/medusa/dist/models";
import AuthCorreosIdService from "./auth-correos-id";
import { PreregisterOrderResponse } from "../types/correos/preregister/response";
import { Order } from "@medusajs/types/dist/dal/utils";
import { MedusaOrderToCorreosOrderMapper } from "./mappers/medusa-order-to-correos-order";
import { PreregisterDto } from "../types/correos/preregister/request";

export default class PreregisterOrderValidateService extends TransactionBaseService {
  protected manager_: any;
  protected __container__: any;
  protected client_: any;
  private baseUrl: string | undefined;
  private apiPath: string | undefined;
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  protected authCorreosIdService: AuthCorreosIdService;
  protected orderService: OrderService;

  constructor(container) {
    super(container);
    this.authCorreosIdService = container.authCorreosIdService;
    this.orderService = container.orderService;
    this.baseUrl = process.env.MULESOFT_API_BASE_URL;
    this.apiPath = process.env.MULESOFT_API_PREREGISTER_VALIDATE_URL;
    this.clientId = process.env.MULESOFT_CLIENT_ID;
    this.clientSecret = process.env.MULESOFT_CLIENT_SECRET;
  }

  async getToken(): Promise<string> {
    const { access_token } = await this.authCorreosIdService.authenticate();
    return access_token;
  }

  private async getShipmentData(
    orderId: string
  ): Promise<PreregisterDto | null> {
    const order = await this.orderService.retrieve(orderId, {
      relations: ["items", "items.variant", "shipping_address", "customer"],
    });
    if (!order) {
      return null;
    }

    // Crear el mapper y transformar el pedido
    const mapper = new MedusaOrderToCorreosOrderMapper();
    return mapper.transform(order);
  }

  async validate(orderId: string): Promise<PreregisterOrderResponse | Error> {
    const shipmentsData = await this.getShipmentData(orderId);
    if (!shipmentsData) {
      return {
        message: `No shipment data found for order with id ${orderId}`,
      } as Error;
    }

    return this._validate(shipmentsData);
  }

  private async _validate(
    shipmentData: PreregisterDto
  ): Promise<PreregisterOrderResponse> {
    try {
      console.log(`\n✅ Validando prerregistro...`);

      const token = await this.getToken();
      const url = `${this.baseUrl}${this.apiPath}`;

      console.log(`📡 URL: ${url}`);
      console.log(
        `📄 Datos a validar:`,
        JSON.stringify(shipmentData, null, 2).substring(0, 200) + "...\n"
      );

      const response = await fetch(url, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(shipmentData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      console.log("✓ Validación exitosa");
      console.log("📋 Respuesta:", JSON.stringify(data, null, 2));

      return data;
    } catch (error) {
      console.error("\n❌ Error en validación:", error.message);
      throw error;
    }
  }
}
