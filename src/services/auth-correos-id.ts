import { TransactionBaseService } from "@medusajs/medusa";
import { Product, ProductCategory } from "@medusajs/medusa/dist/models";

type InjectedDependencies = {
  manager: any;
};
type AuthCorreosIDResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

export default class AuthCorreosIdService extends TransactionBaseService {
  protected manager_: any;
  protected client_: any;
  private baseUrl: string | undefined;
  private authPath: string | undefined;
  private clientId: string | undefined;
  private clientSecret: string | undefined;

  constructor({ manager }: InjectedDependencies) {
    super({ manager });
    this.manager_ = manager;

    this.baseUrl = process.env.CORREOSID_API_BASE_URL;
    this.authPath = process.env.CORREOSID_API_AUTH_URL;
    this.clientId = process.env.CORREOSID_CLIENT_ID;
    this.clientSecret = process.env.CORREOSID_CLIENT_SECRET;
  }

  async authenticate(): Promise<AuthCorreosIDResponse> {
    try {
      console.log(`\n🔐 Autenticando en ${this.baseUrl}...`);

      const url = `${this.baseUrl}${this.authPath}`;

      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: "AP3 LBS RCG",
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Guardar token
      const expiresIn = data.expires_in || 3600;
      //await TokenManager.saveToken(data.idToken, expiresIn);

      console.log("✓ Autenticación exitosa");
      console.log(
        `✓ Token válido por ${expiresIn} segundos (${Math.floor(
          expiresIn / 60
        )} minutos)`
      );
      console.log(`✓ Token: ${data.idToken.substring(0, 50)}...`);

      return {
        access_token: data.idToken,
        expires_in: expiresIn,
        token_type: data.token_type || "Bearer",
      };
    } catch (error) {
      console.error("\n❌ Error en autenticación:", error.message);
      throw error;
    }
  }
}
