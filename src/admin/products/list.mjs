import Medusa from "@medusajs/medusa-js";

// Configura el cliente con la URL de tu servidor Medusa
const client = new Medusa({
  baseUrl: "http://localhost:9000", // Asegúrate de usar la URL correcta de tu servidor Medusa
});

async function listProducts() {
  try {
    await client.admin.auth.getToken({
      email: "admin@medusa-test.com",
      password: "supersecret",
    });
    const response = await client.admin.products.list();
    console.log(response);
  } catch (error) {
    console.error("Error al listar productos:", error);
  }
}

listProducts();
