import { OrderService, TransactionBaseService } from "@medusajs/medusa";
import { Order, Product, ProductCategory } from "@medusajs/medusa/dist/models";
import AuthCorreosIdService from "./auth-correos-id";
import { MedusaOrderToCorreosOrderMapper } from "./mappers/medusa-order-to-correos-order";
import { PreregisterOrderResponse } from "../types/correos/preregister/response";
import { PreregisterDto } from "../types/correos/preregister/request";

export default class PreregisterOrderService extends TransactionBaseService {
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
    this.apiPath = process.env.MULESOFT_API_PREREGISTER_URL;
    this.clientId = process.env.MULESOFT_CLIENT_ID;
    this.clientSecret = process.env.MULESOFT_CLIENT_SECRET;
  }

  async getToken(): Promise<string> {
    const { access_token } = await this.authCorreosIdService.authenticate();
    return access_token;
  }

  private async getOrder(orderId: string) {
    return await this.orderService.retrieve(orderId, {
      relations: ["items", "items.variant", "shipping_address", "customer"],
    });
  }

  async register(orderId: string): Promise<PreregisterOrderResponse> {
    const order = await this.getOrder(orderId);
    const mapper = new MedusaOrderToCorreosOrderMapper();
    const shipmentsData = mapper.transform(order);
    return this._register(shipmentsData, order);
  }

  async _register(
    shipmentData: PreregisterDto,
    order: Order
  ): Promise<PreregisterOrderResponse & { orderNumber: string }> {
    try {
      console.log(`\n✅ Ejecutando prerregistro...`);

      const token = await this.getToken();
      const url = `${this.baseUrl}${this.apiPath}`;

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

      console.log("✓ Ejecución exitosa");
      console.log("📋 Respuesta:", JSON.stringify(data, null, 2));

      return { ...data, orderNumber: order.display_id };
    } catch (error) {
      console.error("\n❌ Error en ejecución del preregistro:", error.message);
      throw error;
    }
  }
}
