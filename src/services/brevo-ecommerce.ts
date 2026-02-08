import { TransactionBaseService } from "@medusajs/medusa";
import { Product, ProductVariant } from "@medusajs/medusa";

interface BrevoProductPayload {
  id: string;
  name: string;
  url?: string;
  imageUrl?: string;
  price?: number;
  stock?: number;
  sku?: string;
  metaInfo?: Record<string, string | number>;
  updateEnabled?: boolean;
}

interface BrevoContactPayload {
  email: string;
  attributes?: Record<string, string | number | boolean>;
  listIds?: number[];
  updateEnabled?: boolean;
}

interface BrevoApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
}

class BrevoEcommerceService extends TransactionBaseService {
  protected apiKey: string;
  protected baseUrl: string = "https://api.brevo.com/v3";
  protected maxRetries: number = 3;
  protected storeUrl: string;

  constructor(container, options?) {
    super(container);
    this.apiKey = process.env.BREVO_API_KEY || "";
    this.storeUrl = process.env.STORE_URL || "https://cartago4x4.com";

    if (!this.apiKey) {
      console.warn(
        "[BrevoEcommerceService] BREVO_API_KEY not configured. Brevo integration will not work."
      );
    }
  }

  /**
   * Make HTTP request to Brevo API with retry logic and exponential backoff
   */
  private async makeRequest(
    method: string,
    endpoint: string,
    body?: object
  ): Promise<BrevoApiResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "api-key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After") || "5";
          const waitTime = parseInt(retryAfter, 10) * 1000;
          console.warn(
            `[BrevoEcommerceService] Rate limited. Waiting ${waitTime}ms before retry.`
          );
          await this.sleep(waitTime);
          continue;
        }

        // Handle success (200, 201, 204)
        if (response.ok) {
          // 204 No Content
          if (response.status === 204) {
            return { success: true, data: {}, status: response.status };
          }
          const data = await response.json().catch(() => ({}));
          return { success: true, data, status: response.status };
        }

        // Handle duplicate contact (409) as success for ensureContact
        if (response.status === 409) {
          // try to parse body for contact id
          const body = await response.json().catch(() => ({}));
          return { success: true, data: { duplicate: true, body }, status: response.status };
        }

        // Handle other errors
        // Attempt to get error body for logging
        const errorBody = await response.text().catch(() => "");
        const errorMessage = errorBody || `HTTP ${response.status}`;

        // Don't retry on 4xx errors (except 429)
        if (response.status >= 400 && response.status < 500) {
          return { success: false, error: `HTTP ${response.status}`, data: { body: errorBody }, status: response.status };
        }

        lastError = new Error(errorMessage);
      } catch (error) {
        lastError = error as Error;
        console.error(
          `[BrevoEcommerceService] Request failed (attempt ${attempt}/${this.maxRetries}):`,
          error
        );
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError?.message || "Max retries exceeded",
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sync a product with Brevo E-commerce catalog
   * POST /v3/products
   */
  async syncProduct(product: Product): Promise<BrevoApiResponse> {
    if (!this.apiKey) {
      return { success: false, error: "BREVO_API_KEY not configured" };
    }

    // Get the first variant's price and stock for the product
    const firstVariant = product.variants?.[0];
    const price = firstVariant?.prices?.[0]?.amount
      ? firstVariant.prices[0].amount / 100
      : undefined;
    const stock = firstVariant?.inventory_quantity;
    const imageUrl = product.thumbnail || product.images?.[0]?.url;

    const payload: BrevoProductPayload = {
      id: product.id,
      name: product.title,
      url: `${this.storeUrl}/products/${product.handle}`,
      imageUrl,
      price,
      stock,
      sku: firstVariant?.sku || undefined,
      metaInfo: {
        description: product.description || "",
        handle: product.handle || "",
      },
      // Allow Brevo to update existing product when ID already exists
      updateEnabled: true,
    };

    console.log(`[BrevoEcommerceService] Syncing product ${product.id}`);
    const result = await this.makeRequest("POST", "/products", payload);

    if (result.success) {
      console.log(
        `[BrevoEcommerceService] Product ${product.id} synced successfully`
      );
    } else {
      console.error(
        `[BrevoEcommerceService] Failed to sync product ${product.id}:`,
        result.error
      );
    }

    return result;
  }

  /**
   * Sync a product variant with Brevo E-commerce catalog
   * Uses variant_id as the product ID in Brevo for granular stock tracking
   */
  async syncVariant(
    variant: ProductVariant,
    product: Product
  ): Promise<BrevoApiResponse> {
    if (!this.apiKey) {
      return { success: false, error: "BREVO_API_KEY not configured" };
    }

    const price = variant.prices?.[0]?.amount
      ? variant.prices[0].amount / 100
      : undefined;
    const imageUrl = product.thumbnail || product.images?.[0]?.url;

    // Build variant title
    const variantTitle = variant.title !== "Default Title" 
      ? `${product.title} - ${variant.title}`
      : product.title;

    const payload: BrevoProductPayload = {
      id: variant.id,
      name: variantTitle,
      url: `${this.storeUrl}/products/${product.handle}?variant=${variant.id}`,
      imageUrl,
      price,
      stock: variant.inventory_quantity,
      sku: variant.sku || undefined,
      metaInfo: {
        product_id: product.id,
        product_handle: product.handle || "",
        variant_title: variant.title || "",
      },  
    };

    console.log(`[BrevoEcommerceService] Syncing variant ${variant.id}`);
    const result = await this.makeRequest("POST", "/products", payload);

    if (result.success) {
      console.log(
        `[BrevoEcommerceService] Variant ${variant.id} synced successfully`
      );
    } else {
      console.error(
        `[BrevoEcommerceService] Failed to sync variant ${variant.id}:`,
        result.error
      );
    }

    return result;
  }

  /**
   * Ensure a contact exists in Brevo
   * POST /v3/contacts
   * Returns success even if contact already exists (409 Duplicate)
   */
  async ensureContact(
    email: string,
    attributes?: Record<string, string | number | boolean>
  ): Promise<BrevoApiResponse> {
    if (!this.apiKey) {
      return { success: false, error: "BREVO_API_KEY not configured" };
    }

    const payload: BrevoContactPayload = {
      email,
      attributes,
      updateEnabled: true,
    };

    console.log(`[BrevoEcommerceService] Ensuring contact exists: ${email}`);
    const result = await this.makeRequest("POST", "/contacts", payload);

    if (result.success) {
      const status = result.data?.duplicate ? "already exists" : "created";
      console.log(`[BrevoEcommerceService] Contact ${email} ${status}`);
      // try to surface contact id if available
      const rawId = result.data?.id || result.data?.body?.id || result.data?.body?.contactId;
      const contactId = rawId !== undefined && rawId !== null ? String(rawId) : undefined;
      return { ...result, data: { ...result.data, contactId } };
    } else {
      console.error(
        `[BrevoEcommerceService] Failed to ensure contact ${email}:`,
        result.error,
        result.data
      );
    }

    return result;
  }

  /**
   * Create a product alert (back in stock) for a contact
   * POST /v3/products/{id}/alerts/back_in_stock
   * @deprecated Use sendTransactionalEmail instead (E-commerce API requires Pro/Enterprise plan)
   */
  async createProductAlert(
    email: string,
    productId: string,
    contactId?: string
  ): Promise<BrevoApiResponse> {
    if (!this.apiKey) {
      return { success: false, error: "BREVO_API_KEY not configured" };
    }

    const endpoint = `/products/${encodeURIComponent(productId)}/alerts/back_in_stock`;
    const contactIdentifiers: any = { email };
    if (contactId !== undefined && contactId !== null) {
      contactIdentifiers.ext_id = String(contactId);
    }

    const payload = {
      contactIdentifiers,
    };

    console.log(
      `[BrevoEcommerceService] Creating product alert for ${email} on product ${productId}`
    );
    const result = await this.makeRequest("POST", endpoint, payload);

    if (result.success) {
      console.log(
        `[BrevoEcommerceService] Product alert created for ${email} on ${productId}`
      );
    } else {
      console.error(
        `[BrevoEcommerceService] Failed to create product alert:`,
        result.error,
        result.data
      );
    }

    return result;
  }

  /**
   * Send a single transactional email via Brevo SMTP API
   * POST /v3/smtp/email
   */
  async sendTransactionalEmail(
    to: { email: string; name?: string }[],
    subject: string,
    htmlContent?: string,
    templateId?: number,
    params?: Record<string, any>,
    sender?: { email: string; name?: string }
  ): Promise<BrevoApiResponse> {
    if (!this.apiKey) {
      return { success: false, error: "BREVO_API_KEY not configured" };
    }

    const payload: any = {
      sender: sender || {
        email: process.env.MAILERSEND_SENDER_EMAIL || "noreply@cartago4x4.com",
        name: process.env.MAILERSEND_SENDER_NAME || "Cartago4x4",
      },
      to,
      subject,
    };

    if (templateId) {
      payload.templateId = templateId;
    }

    if (htmlContent) {
      payload.htmlContent = htmlContent;
    }

    if (params) {
      payload.params = params;
    }

    console.log(
      `[BrevoEcommerceService] Sending transactional email to ${to.length} recipient(s)`
    );
    const result = await this.makeRequest("POST", "/smtp/email", payload);

    if (result.success) {
      console.log(
        `[BrevoEcommerceService] Transactional email sent successfully`
      );
    } else {
      console.error(
        `[BrevoEcommerceService] Failed to send transactional email:`,
        result.error,
        result.data
      );
    }

    return result;
  }

  /**
   * Send batch transactional emails via Brevo SMTP API
   * POST /v3/smtp/email with messageVersions
   * Can send up to 1000 message versions in one API call
   */
  async sendBatchTransactionalEmail(
    messageVersions: Array<{
      to: { email: string; name?: string }[];
      subject?: string;
      htmlContent?: string;
      params?: Record<string, any>;
    }>,
    defaultSubject: string,
    defaultHtmlContent?: string,
    templateId?: number,
    defaultParams?: Record<string, any>,
    sender?: { email: string; name?: string }
  ): Promise<BrevoApiResponse> {
    if (!this.apiKey) {
      return { success: false, error: "BREVO_API_KEY not configured" };
    }

    if (messageVersions.length === 0) {
      return {
        success: false,
        error: "No message versions provided",
      };
    }

    if (messageVersions.length > 1000) {
      return {
        success: false,
        error: "Maximum 1000 message versions allowed per batch",
      };
    }

    const payload: any = {
      sender: sender || {
        email: process.env.MAILERSEND_SENDER_EMAIL || "noreply@cartago4x4.com",
        name: process.env.MAILERSEND_SENDER_NAME || "Cartago4x4",
      },
      subject: defaultSubject,
      messageVersions,
    };

    if (templateId) {
      payload.templateId = templateId;
    }

    if (defaultHtmlContent) {
      payload.htmlContent = defaultHtmlContent;
    }

    if (defaultParams) {
      payload.params = defaultParams;
    }

    console.log(
      `[BrevoEcommerceService] Sending batch transactional email with ${messageVersions.length} version(s)`
    );
    const result = await this.makeRequest("POST", "/smtp/email", payload);

    if (result.success) {
      console.log(
        `[BrevoEcommerceService] Batch transactional email sent successfully`,
        result.data
      );
    } else {
      console.error(
        `[BrevoEcommerceService] Failed to send batch transactional email:`,
        result.error,
        result.data
      );
    }

    return result;
  }
}

export default BrevoEcommerceService;
