import { TransactionBaseService } from "@medusajs/medusa";
import { Product, ProductCategory } from "@medusajs/medusa/dist/models";
import AuthCorreosIdService from "./auth-correos-id";
import PreregisterOrderValidateService from "./preregister-order-validate";
import { PrintLabelResponse } from "../types/correos/labels/response";
import { PrintLabelRequest } from "../types/correos/labels/request";
import { CORREOS_PRINT_LABEL_CONSTANTS } from "../constants/correos-constants";
import PreregisterOrderService from "./preregister-order";

export default class LabelShipmentPrintService extends TransactionBaseService {
  protected manager_: any;
  protected __container__: any;
  protected client_: any;
  private baseUrl: string | undefined;
  private apiPath: string | undefined;
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  protected authCorreosIdService: AuthCorreosIdService;
  protected preregisterOrderService: PreregisterOrderService;
  constructor(container) {
    super(container);
    this.authCorreosIdService = container.authCorreosIdService;
    this.preregisterOrderService = container.preregisterOrderService;

    this.baseUrl = process.env.MULESOFT_API_BASE_URL;
    this.apiPath = process.env.MULESOFT_API_LABELS_PRINT_URL;
    this.clientId = process.env.MULESOFT_CLIENT_ID;
    this.clientSecret = process.env.MULESOFT_CLIENT_SECRET;
  }

  async getToken(): Promise<string> {
    const { access_token } = await this.authCorreosIdService.authenticate();
    return access_token;
  }

  private getLabelPrintRequestDto(shipmentCode: string): PrintLabelRequest {
    return {
      application: CORREOS_PRINT_LABEL_CONSTANTS.APPLICATION,
      documentationType: CORREOS_PRINT_LABEL_CONSTANTS.DOCUMENTATION_TYPE,
      print: {
        labelOrderType: CORREOS_PRINT_LABEL_CONSTANTS.LABEL_ORDER_TYPE,
        labelFormat: CORREOS_PRINT_LABEL_CONSTANTS.LABEL_FORMAT,
        labelPrintMode: CORREOS_PRINT_LABEL_CONSTANTS.LABEL_PRINT_MODE,
        labelPrintInitialPosition:
          CORREOS_PRINT_LABEL_CONSTANTS.LABEL_PRINT_INITIAL_POSITION,
        shipments: [shipmentCode],
      },
    };
  }

  async generateLabel(orderId: string): Promise<PrintLabelResponse> {
    try {
      console.log(`\n✅ Ejecutando label printing...`);

      const token = await this.getToken();
      const url = `${this.baseUrl}${this.apiPath}`;

      const orderPreregistered = await this.preregisterOrderService.register(
        orderId
      );
      const shipmentCode =
        orderPreregistered.shipments?.[0].packages?.[0].packageCode;

      const requestBodyDto: PrintLabelRequest =
        this.getLabelPrintRequestDto(shipmentCode);

      console.log(
        `📡 Enviando solicitud de impresión de etiqueta...`,
        url,
        requestBodyDto
      );
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBodyDto),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      data.orderNumber = orderPreregistered.orderNumber;
      data.shipmentCode = shipmentCode;
      //Transform base64 to pdf buffer

      console.log("✓ Ejecución exitosa");
      console.log("📋 Respuesta:", JSON.stringify(data, null, 2));

      return data;
    } catch (error) {
      console.error("\n❌ Error en ejecución del preregistro:", error.message);
      throw error;
    }
  }
}
