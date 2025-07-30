import { medusa } from "../auth/index.mjs";

const getLatestOrders = async () => {
  try {
    // Autenticación con el admin
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });

    // Obtener las últimas 5 órdenes
    const { orders, count } = await medusa.admin.orders.list({
      limit: 5,
      offset: 0,
      order: "-created_at",
    });

    console.log("\n=== Últimas 5 órdenes ===\n");
    orders.forEach((order) => {
      console.log(`ID: ${order.id}`);
      console.log(`Fecha: ${new Date(order.created_at).toLocaleString()}`);
      console.log(`Estado: ${order.status}`);
      console.log(`Total: ${order.total}`);
      console.log(`Cliente: ${order.customer?.email || "N/A"}`);
      console.log("------------------------\n");
    });

    console.log(`Total de órdenes encontradas: ${count}`);
  } catch (error) {
    console.error("Error al obtener las órdenes:", error.message);
  }
};

// Ejecutar la función
getLatestOrders();
