import { medusa } from "../auth/index.mjs";

async function getProducts() {
  try {
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });
    const { products } = await medusa.admin.products.list();
    console.log("Products: ", products.length);
  } catch (error) {
    console.error("Error al listar productos:", error);
  }
}

// Función para actualizar un producto
const updateProductThumbnail = async (
  productId,
  updatedThumbnail,
  updatedImages
) => {
  try {
    // Actualizamos el thumbnail del producto a través del cliente de Medusa
    await medusa.admin.products.update(productId, {
      thumbnail: updatedThumbnail,
      images: updatedImages,
    });

    console.log(`Producto con ID ${productId} actualizado correctamente.`);
  } catch (error) {
    console.error(
      `Error al actualizar el producto ${productId}:`,
      error.message
    );
  }
};

const main = async () => {
  try {
    // Obtener los productos filtrados
    const filteredProducts = await getProducts();

    console.log(
      "Filtered products =>",
      filteredProducts.map((p) => ({
        thumbnail: p.thumbnail,
        images: p.images.map((img) => img.url),
      }))
    );
    console.log("Total => ", filteredProducts.length);

    // Iterar sobre los productos y actualizar el thumbnail
    // for (const product of filteredProducts) {
    //   const updatedThumbnail = product.thumbnail.replace(
    //     "tmp4",
    //     "suzuki/samurai/products"
    //   );
    //   const updatedImages = product.images.map((img) =>
    //     img.url.replace("tmp4", "suzuki/samurai/products")
    //   );
    //   // Actualizar el producto
    //   await updateProductThumbnail(product.id, updatedThumbnail, updatedImages);
    // }
    const product = filteredProducts[0];
    const updatedThumbnail = product.thumbnail.replace(
      "tmp4",
      "suzuki/samurai/products"
    );
    const updatedImages = product.images.map((img) =>
      img.url.replace("tmp4", "suzuki/samurai/products")
    );
    console.log("updating...", product.title);
    await updateProductThumbnail(product.id, updatedThumbnail, updatedImages);
  } catch (error) {
    console.error("Error al ejecutar el script:", error.message);
  }
};

getProducts();
