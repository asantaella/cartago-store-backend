import { algoliasearch } from "algoliasearch";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY;
const ALGOLIA_INDEX_NAME = process.env.ALGOLIA_INDEX_NAME;

if (!ALGOLIA_APP_ID || !ALGOLIA_API_KEY || !ALGOLIA_INDEX_NAME) {
  console.error("Faltan variables de entorno de Algolia.");
  console.log("ALGOLIA_APP_ID:", ALGOLIA_APP_ID);
  console.log("ALGOLIA_API_KEY:", ALGOLIA_API_KEY);
  console.log("ALGOLIA_INDEX_NAME:", ALGOLIA_INDEX_NAME);
  process.exit(1);
}

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);

async function updateAlgoliaRecord(productId, updatedProductData) {
  try {
    // Asegúrate de que updatedProductData contenga objectID
    const algoliaObject = {
      objectID: productId,
      ...updatedProductData,
    };

    // Actualiza el registro en Algolia
    const result = await client.saveObject({
      indexName: ALGOLIA_INDEX_NAME,
      body: algoliaObject,
    });

    console.log("Registro de Algolia actualizado:", result);
  } catch (error) {
    console.error("Error al actualizar el registro de Algolia:", error);
  }
}

// Ejemplo de uso
const productIdToUpdate = "prod_01JT1JRDFSY4CJPJZ0E4A4CACM"; // Reemplaza con el ID del producto real
const updatedProductData = {
  title: "Latiguillo freno delantero chasis - carrocería M12",
  handle: "latiguillo-freno-delantero-chasis-carroceria-m12",
  // Agrega otros campos que desees actualizar
};

updateAlgoliaRecord(productIdToUpdate, updatedProductData);
