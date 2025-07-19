import { PricedProduct } from "@medusajs/medusa/dist/types/pricing";
import AlgoliaService from "../algolia";
import {
  Product,
  ProductCategory,
  ProductType,
} from "@medusajs/medusa/dist/models";

// Mock de algoliasearch
const mockSaveObject = jest.fn().mockResolvedValue({ taskID: "123" });
const mockDeleteObject = jest.fn().mockResolvedValue({ taskID: "456" });
const mockAlgoliaClient = {
  saveObject: mockSaveObject,
  deleteObject: mockDeleteObject,
};

jest.mock("algoliasearch", () => {
  return {
    algoliasearch: jest.fn().mockImplementation(() => mockAlgoliaClient),
  };
});

describe("AlgoliaService", () => {
  let algoliaService: AlgoliaService;
  let mockManager: any;

  // Variables de entorno originales para restaurar después
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    // Configurar variables de entorno para testing
    process.env.ALGOLIA_APP_ID = "test-app-id";
    process.env.ALGOLIA_API_KEY = "test-api-key";
    process.env.ALGOLIA_INDEX_NAME = "test-index";

    mockManager = {
      // Mock del manager de MedusaJS si es necesario
    };

    // Limpiar los mocks
    mockSaveObject.mockClear();
    mockDeleteObject.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Constructor", () => {
    it("should initialize correctly with valid environment variables", () => {
      algoliaService = new AlgoliaService({ manager: mockManager });

      expect(algoliaService).toBeInstanceOf(AlgoliaService);
    });

    it("should disable service when ALGOLIA_APP_ID is missing", () => {
      delete process.env.ALGOLIA_APP_ID;

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      algoliaService = new AlgoliaService({ manager: mockManager });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Algolia no está configurado - servicio deshabilitado"
      );

      consoleSpy.mockRestore();
    });

    it("should disable service when ALGOLIA_API_KEY is missing", () => {
      delete process.env.ALGOLIA_API_KEY;

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      algoliaService = new AlgoliaService({ manager: mockManager });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Algolia no está configurado - servicio deshabilitado"
      );

      consoleSpy.mockRestore();
    });

    it("should disable service when ALGOLIA_INDEX_NAME is missing", () => {
      delete process.env.ALGOLIA_INDEX_NAME;

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      algoliaService = new AlgoliaService({ manager: mockManager });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Algolia no está configurado - servicio deshabilitado"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("sortCategories", () => {
    beforeEach(() => {
      algoliaService = new AlgoliaService({ manager: mockManager });
    });

    it("should sort categories by order metadata", () => {
      const categories: Partial<ProductCategory>[] = [
        { name: "Category C", metadata: { order: 3 } },
        { name: "Category A", metadata: { order: 1 } },
        { name: "Category B", metadata: { order: 2 } },
      ];

      const result = algoliaService.sortCategories(
        categories as ProductCategory[]
      );

      expect(result).toEqual(["Category A", "Category B", "Category C"]);
    });

    it("should assign default order 1000 to categories without order metadata", () => {
      const categories: Partial<ProductCategory>[] = [
        { name: "Category With Order", metadata: { order: 1 } },
        { name: "Category Without Order", metadata: {} },
        { name: "Category With Null Metadata", metadata: undefined },
        { name: "Category Without Metadata" },
      ];

      const result = algoliaService.sortCategories(
        categories as ProductCategory[]
      );

      expect(result[0]).toBe("Category With Order");
      // Las categorías sin orden específico deberían aparecer después
      expect(result.slice(1)).toContain("Category Without Order");
      expect(result.slice(1)).toContain("Category With Null Metadata");
      expect(result.slice(1)).toContain("Category Without Metadata");
    });

    it("should handle empty categories array", () => {
      const result = algoliaService.sortCategories([]);
      expect(result).toEqual([]);
    });
  });

  describe("syncProduct", () => {
    let mockProduct: Partial<
      Omit<Product, "categories"> & { categories: Partial<ProductCategory>[] }
    >;

    beforeEach(() => {
      algoliaService = new AlgoliaService({ manager: mockManager });

      mockProduct = {
        id: "test-product-id",
        title: "Test Product",
        handle: "test-product",
        thumbnail: "http://example.com/thumbnail.jpg",
        created_at: new Date("2023-01-01"),
        updated_at: new Date("2023-01-02"),
        categories: [
          {
            name: "Category 1",
            metadata: { order: 1 },
          },
          {
            name: "Category 2",
            metadata: { order: 2 },
          },
        ],
        tags: [{ value: "tag1" }, { value: "tag2" }] as any[],
      };
    });

    it("should sync product successfully", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await algoliaService.syncProduct(mockProduct as Product);

      expect(mockSaveObject).toHaveBeenCalledWith({
        indexName: "test-index",
        body: {
          objectID: "test-product-id",
          id: "test-product-id",
          title: "Test Product",
          handle: "test-product",
          categories: ["Category 1", "Category 2"],
          tags: ["tag1", "tag2"],
          thumbnail: "http://example.com/thumbnail.jpg",
          created_at: mockProduct.created_at,
          updated_at: mockProduct.updated_at,
        },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Producto test-product-id sincronizado correctamente"
      );

      consoleSpy.mockRestore();
    });

    it("should handle product without tags", async () => {
      mockProduct.tags = undefined;

      await algoliaService.syncProduct(mockProduct as Product);

      expect(mockSaveObject).toHaveBeenCalledWith({
        indexName: "test-index",
        body: expect.objectContaining({
          tags: [],
        }),
      });
    });

    it("should skip sync when service is disabled", async () => {
      // Crear servicio deshabilitado
      delete process.env.ALGOLIA_APP_ID;
      const disabledService = new AlgoliaService({ manager: mockManager });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await disabledService.syncProduct(mockProduct as Product);

      expect(mockSaveObject).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Servicio deshabilitado - saltando sincronización"
      );

      consoleSpy.mockRestore();
    });

    it("should handle sync errors gracefully", async () => {
      const error = new Error("Algolia sync error");
      mockSaveObject.mockRejectedValueOnce(error);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // No debería lanzar error
      await expect(
        algoliaService.syncProduct(mockProduct as Product)
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Error sincronizando producto test-product-id:",
        error
      );

      consoleSpy.mockRestore();
    });

    it("should handle timeout gracefully", async () => {
      // Simular una operación que nunca se resuelve (timeout)
      mockSaveObject.mockImplementationOnce(() => new Promise(() => {}));

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      await algoliaService.syncProduct(mockProduct as Product);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Error sincronizando producto test-product-id:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    }, 10000); // Aumentar timeout del test
  });

  describe("deleteProduct", () => {
    beforeEach(() => {
      algoliaService = new AlgoliaService({ manager: mockManager });
    });

    it("should delete product successfully", async () => {
      const productId = "test-product-id";
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await algoliaService.deleteProduct(productId);

      expect(mockDeleteObject).toHaveBeenCalledWith({
        indexName: "test-index",
        objectID: productId,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Producto test-product-id eliminado correctamente"
      );

      consoleSpy.mockRestore();
    });

    it("should skip deletion when service is disabled", async () => {
      // Crear servicio deshabilitado
      delete process.env.ALGOLIA_APP_ID;
      const disabledService = new AlgoliaService({ manager: mockManager });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await disabledService.deleteProduct("test-product-id");

      expect(mockDeleteObject).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Servicio deshabilitado - saltando eliminación"
      );

      consoleSpy.mockRestore();
    });

    it("should handle deletion errors gracefully", async () => {
      const productId = "test-product-id";
      const error = new Error("Algolia deletion error");
      mockDeleteObject.mockRejectedValueOnce(error);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // No debería lanzar error
      await expect(
        algoliaService.deleteProduct(productId)
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Error eliminando producto test-product-id:",
        error
      );

      consoleSpy.mockRestore();
    });

    it("should handle timeout gracefully", async () => {
      const productId = "test-product-id";
      // Simular una operación que nunca se resuelve (timeout)
      mockDeleteObject.mockImplementationOnce(() => new Promise(() => {}));

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      await algoliaService.deleteProduct(productId);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ALGOLIA] Error eliminando producto test-product-id:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    }, 15000); // Aumentar timeout del test para el timeout de 10s del delete
  });
});
