import { medusa } from "../auth/index.mjs";
import path from "path";
import fs from "fs/promises";

async function getProducts() {
  try {
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });

    const { products } = await medusa.admin.products.list();
    console.log("Products: ", products.length);
  } catch (error) {
    console.error("Error al listar productos:");
  }
}

const workspacePath = path.resolve();
const newProducts = JSON.parse(
  await fs.readFile(
    path.join(workspacePath, "e2e/products", "products.json"),
    "utf-8"
  )
);
console.log("newProducts = ", newProducts.length);
getProducts();

const failedProducts = [];

for (const product of newProducts) {
  await medusa.admin.auth.getToken({
    email: "cartago4x4@gmail.com",
    password: "suru",
  });
  await medusa.admin.products
    .create(product)
    .then(({ product }) => {
      console.log(`[CREATED]: ${product.title}`);
    })
    .catch((error) => {
      console.error(
        `Error creating product ${product.title}: ${error}`
      );
      failedProducts.push(product.title);
    });
  if (failedProducts.length > 0) break;
}

if (failedProducts.length > 0) {
  await fs.writeFile(
    path.join(workspacePath, "e2e/products", "products_error.json"),
    JSON.stringify(failedProducts, null, 2),
    "utf-8"
  );
}
