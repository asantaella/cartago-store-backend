import pkg from "@medusajs/medusa";
const { OrderService, EventBusService } = pkg;

async function reemitirNotificaciones(orderId) {
    // Recupera el pedido (puedes usar OrderService o el repositorio directo)
    const orderService = new OrderService({
        manager: {}, // Inyecta el gestor de la base de datos si es necesario
        orderRepository: {}, // Inyecta el repositorio de pedidos si es necesario
        eventBusService: new EventBusService({
            stagedJobService: {}, // Inyecta el servicio de trabajos en espera si es necesario
            logger: console, // Inyecta el logger si es necesario
        }), // Inyecta el servicio del bus de eventos
        // Agrega otras dependencias necesarias aquí
    });

    const order = await orderService.retrieve(orderId);

    if (!order) {

        console.error(`No se encontró el pedido con ID: ${orderId}`);
        return;
    }

    // Reemite el evento que dispara las notificaciones
    await orderService.eventBusService.emit("order.placed", { order });
    console.log(`Evento order.placed reemitido para el pedido ${orderId}`);
}

// Llama a la función con el ID del pedido que deseas reprocesar
reemitirNotificaciones("order_01JMA89JQ1AAKTAN4JXJN8QSN3");

export { reemitirNotificaciones };
