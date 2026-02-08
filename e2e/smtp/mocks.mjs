// ============================================================
// MOCKS para E2E Testing de Email Sending
// ============================================================

/**
 * Mock data para testing de los tres tipos de emails
 */

export const mockProductVariant = {
    id: "variant-123",
    title: "Accesorio portón trasero rueda",
    sku: "SZK-SMR-941",
    inventory_quantity: 0,
    prices: [
        {
            amount: 50.00, // 459.90 EUR
            currency_code: "eur",
        },
    ],
};

export const mockProduct = {
    id: "prod-456",
    title: "Accesorio portón trasero rueda",
    handle: "accesorio-porton-trasero-rueda",
    thumbnail: "https://pub-9f70c8529e1d47ab90225640bcffecd9.r2.dev/Accesorio%20port%C3%83%C2%B3n%20trasero%20rueda_01.jpg?v=1767832537545&w=3840&q=75",
    images: [
        {
            url: "https://pub-9f70c8529e1d47ab90225640bcffecd9.r2.dev/Accesorio%20port%C3%83%C2%B3n%20trasero%20rueda_01.jpg?v=1767832537545&w=3840&q=75",
        },
    ],
};

export const mockSubscriber = {
    email: "a.santaella.m@gmail.com",
    name: "Antonio",
};

export const mockSubscribers = [
    { email: "a.santaella.m@gmail.com", },
    { email: "a_santaella84@hotmail.com", },

];

/**
 * 
 * Template Variables para back-in-stock-alert
 * Enviado a: Cliente
 * Cuándo: Producto vuelve a estar disponible
 */
export const backInStockAlertContext = {
    product_name: mockProductVariant.title,
    product_url: `https://cartago4x4.com/products/${mockProduct.handle}`,
    product_image: mockProduct.thumbnail,
    product_price: "50.00",
    variant_sku: mockProductVariant.sku,
    subscriber_name: mockSubscriber.name,
    unsubscribe_url: `https://cartago4x4.com/account/alerts/unsubscribe?email=${encodeURIComponent(mockSubscriber.email)}&variant=${mockProductVariant.id}`,
    current_year: new Date().getFullYear(),
};

/**
 * Template Variables para back-in-stock-alert-admin
 * Enviado a: Admin
 * Cuándo: Se han notificado todos los clientes
 */
export const backInStockAlertAdminContext = {
    subscribers_count: mockSubscribers.length,
    image_url: mockProduct.thumbnail,
    variant_title: mockProductVariant.title,
    product_url: `https://cartago4x4.com/products/${mockProduct.handle}`,
    subscribers: mockSubscribers.map(sub => ({
        email: sub.email,
    })),
    current_year: new Date().getFullYear(),
};

/**
 * Template Variables para client-product-subscription-alert (Nueva suscripción)
 * Enviado a: Admin
 * Cuándo: Cliente se suscribe a un producto sin stock
 */
export const clientProductSubscriptionAlertNewContext = {
    is_new: true,
    subscriber_email: mockSubscriber.email,
    image_url: mockProduct.thumbnail,
    variant_title: mockProductVariant.title,
    product_sku: mockProductVariant.sku,
    product_url: `https://cartago4x4.es/products/${mockProduct.handle}`,
    current_year: new Date().getFullYear(),
};

/**
 * Template Variables para client-product-subscription-alert (Reactivada)
 * Enviado a: Admin
 * Cuándo: Cliente reactiva una suscripción
 */
export const clientProductSubscriptionAlertReactivatedContext = {
    is_new: false,
    subscriber_email: mockSubscriber.email,
    image_url: mockProduct.thumbnail,
    variant_title: mockProductVariant.title,
    product_sku: mockProductVariant.sku,
    product_url: `https://cartago4x4.es/products/${mockProduct.handle}`,
    current_year: new Date().getFullYear(),
};

/**
 * Resumen de todos los mocks
 */
export const mockDataSummary = {
    product: mockProduct,
    variant: mockProductVariant,
    subscriber: mockSubscriber,
    subscribers: mockSubscribers,
    templates: {
        backInStockAlert: {
            name: "back-in-stock-alert",
            description: "Notificación a cliente cuando producto está disponible",
            context: backInStockAlertContext,
        },
        backInStockAlertAdmin: {
            name: "back-in-stock-alert-admin",
            description: "Confirmación a admin de envío de alertas",
            context: backInStockAlertAdminContext,
        },
        clientProductSubscriptionAlertNew: {
            name: "client-product-subscription-alert",
            description: "Notificación a admin de nueva suscripción",
            context: clientProductSubscriptionAlertNewContext,
        },
        clientProductSubscriptionAlertReactivated: {
            name: "client-product-subscription-alert",
            description: "Notificación a admin de suscripción reactivada",
            context: clientProductSubscriptionAlertReactivatedContext,
        },
    },
};

export default mockDataSummary;
