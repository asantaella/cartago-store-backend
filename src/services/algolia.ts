import { algoliasearch } from "algoliasearch";
import { TransactionBaseService } from "@medusajs/medusa";
import { Product, ProductCategory } from "@medusajs/medusa/dist/models";

type InjectedDependencies = {
  manager: any;
};

export default class AlgoliaService extends TransactionBaseService {
  protected manager_: any;
  private client_: any;
  private indexName_: string;
  private isEnabled_: boolean;

  constructor({ manager }: InjectedDependencies) {
    super({ manager });
    this.manager_ = manager;

    const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
    const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY;
    this.indexName_ = process.env.ALGOLIA_INDEX_NAME as string;

    this.isEnabled_ = !!(ALGOLIA_APP_ID && ALGOLIA_API_KEY && this.indexName_);

    if (!this.isEnabled_) {
      console.warn(
        "[ALGOLIA] Algolia no está configurado - servicio deshabilitado"
      );
      return;
    }

    try {
      this.client_ = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
      console.log("[ALGOLIA] Cliente inicializado correctamente");
    } catch (error) {
      console.error("[ALGOLIA] Error inicializando cliente:", error);
      this.isEnabled_ = false;
    }
  }

  sortCategories(categories: ProductCategory[]): string[] {
    return categories
      .map((c) => ({
        ...c,
        order: typeof c.metadata?.order === "number" ? c.metadata.order : 1000,
      }))
      .sort((a, b) => a.order - b.order)
      .map((c) => c.name);
  }

  async syncProduct(product: Partial<Product>): Promise<void> {
    if (!this.isEnabled_) {
      console.log("[ALGOLIA] Servicio deshabilitado - saltando sincronización");
      return;
    }

    const categories = this.sortCategories(product.categories);
    const tags = product.tags?.map((t) => t.value) ?? [];
    console.log(`[ALGOLIA] Sincronizando producto ${product.id}...`);

    try {
      const algoliaProduct = {
        objectID: product.id,
        id: product.id,
        title: product.title,
        description: product.description,
        handle: product.handle,
        categories,
        tags,
        thumbnail: product.thumbnail,
        created_at: product.created_at,
        updated_at: product.updated_at,
      };
      console.log(`[ALGOLIA] Producto a sincronizar:`, algoliaProduct);
      // Agregar timeout para evitar que la operación se cuelgue
      const syncPromise = this.client_.saveObject({
        indexName: this.indexName_,
        body: algoliaProduct,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Timeout en sincronización con Algolia")),
          5000
        );
      });

      await Promise.race([syncPromise, timeoutPromise]);

      console.log(
        `[ALGOLIA] Producto ${product.id} sincronizado correctamente`
      );
    } catch (error) {
      console.error(
        `[ALGOLIA] Error sincronizando producto ${product.id}:`,
        error
      );
      // No lanzar el error para evitar que falle todo el flujo
    }
  }

  async deleteProduct(productId: string): Promise<void> {
    if (!this.isEnabled_) {
      console.log("[ALGOLIA] Servicio deshabilitado - saltando eliminación");
      return;
    }

    try {
      const deletePromise = this.client_.deleteObject({
        indexName: this.indexName_,
        objectID: productId,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Timeout en eliminación de Algolia")),
          10000
        );
      });

      await Promise.race([deletePromise, timeoutPromise]);

      console.log(`[ALGOLIA] Producto ${productId} eliminado correctamente`);
    } catch (error) {
      console.error(`[ALGOLIA] Error eliminando producto ${productId}:`, error);
      // No lanzar el error para evitar que falle todo el flujo
    }
  }
}
