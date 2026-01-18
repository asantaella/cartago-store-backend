<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Actualiza la documentación, teniendo en cuento que el cart se completa en backend, cuando la orden ha sido aceptada en Paypal y se haya recibido el webhook correspondiente

La documentación se debe ajustar para reflejar que el `cart` se completa exclusivamente en el backend, después de recibir y validar el webhook exitoso de PayPal, no desde el frontend.[^1][^2]

## Flujo general actualizado

- El frontend (Next.js) solo crea/actualiza el cart, selecciona PayPal como proveedor e inicia el flujo de aprobación (redirect o JS SDK), pero **nunca** llama a `POST /store/carts/:id/complete`.[^2]
- PayPal redirige al usuario o finaliza la autorización; cuando se produce el cobro/autorization, PayPal envía el webhook al endpoint configurado en tu backend Medusa.[^11][^12]
- El handler del webhook valida la firma, comprueba que el evento indica un pago aceptado y, usando la referencia al `payment`/`payment_session`, recupera el `cart` asociado y ejecuta la lógica de “cart completion strategy” en el backend.[^13][^1]


## Responsabilidad del frontend (Next.js)

En la sección de checkout del frontend la documentación debe indicar:

- Mantener el `cart_id` en cliente (state/localStorage/cookie) y usar los endpoints de Store API: crear cart, añadir líneas, direcciones, envío y `setPaymentSession`/`updatePaymentSession` con PayPal.[^6][^2]
- Redirigir al usuario a la aprobación de PayPal y, tras volver a tu frontend, mostrar una pantalla de “procesando pago / esperando confirmación” que consulta periódicamente el estado del `cart` o del `order` (polling a `/store/carts/:id` o `/store/orders/:id`).[^3][^2]
- Cuando el backend haya completado el cart, el polling devolverá un cart con `completed_at` o directamente una `order`, y entonces el frontend redirige a la página de éxito del pedido.[^4][^2]


## Responsabilidad del backend (Medusa + PayPal webhook)

La parte de backend en la documentación debe detallar:

- Endpoint público de webhook de PayPal (por ejemplo `/paypal/hooks`) registrado por el plugin, donde se valida la firma del evento y se identifica el pago.[^11][^13]
- Lógica de manejo del evento “pago aceptado”:
    - Localizar el `payment` de Medusa usando los datos de PayPal (id de la order/capture) y, a través de él, el `cart` asociado.[^6][^13]
    - Invocar la estrategia de “cart completion” (`CartCompletionStrategy`) para ese `cart_id` desde el backend, replicando internamente lo que haría `POST /store/carts/:id/complete` pero sin intervención del frontend.[^1][^6]
    - Manejar idempotencia y posibles reintentos del webhook, usando la infraestructura de claves de idempotencia de Medusa para que el cart solo se complete una vez.[^1]


## Cómo documentar el uso de cartId en este escenario

En la documentación específica de PayPal + Medusa se puede añadir un apartado:

- El `cartId` se asocia al pago en el momento de crear la *payment session* PayPal (`setPaymentSession`/`createPaymentSession`) y queda persistido en la base de datos de Medusa.[^6][^11]
- Cuando llega el webhook, el backend no recibe el `cartId` como campo explícito de PayPal, pero puede resolverlo a través del `payment`/`payment_session` que enlaza con ese cart.[^12][^13]
- Si se necesita trazar el `cartId` directamente desde el payload del webhook (por logging o integraciones externas), se recomienda incluirlo en `custom_id`/`invoice_id` al crear la orden en PayPal, pero la finalización del cart seguirá haciéndose únicamente en el backend cuando el webhook sea válido.[^12]

Con este cambio, toda la documentación de checkout debe dejar claro que:

- El frontend nunca completa el cart tras PayPal.[^2]
- El único “source of truth” para pasar de `cart` a `order` es la lógica backend disparada por el webhook de PayPal + la cart completion strategy de Medusa.[^1][^6]
<span style="display:none">[^10][^5][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: https://docs.medusajs.com/v1/modules/carts-and-checkout/backend/cart-completion-strategy

[^2]: https://docs.medusajs.com/resources/storefront-development/checkout/complete-cart

[^3]: https://medusajs.hashnode.dev/how-i-created-a-nuxtjs-ecommerce-store-from-scratch-using-medusa-part-2-adding-cart-functionality-1

[^4]: https://dianaow.com/posts/sveltekit-ecommerce-checkout

[^5]: https://www.linkedin.com/posts/u11d_medusa-checkout-flow-step-by-step-guide-activity-7407328816206995456-twee

[^6]: https://docs.medusajs.com/v1/modules/carts-and-checkout/overview

[^7]: https://github.com/medusajs/medusa/issues/13625

[^8]: https://www.rigbyjs.com/blog/medusa-architecture-and-structure

[^9]: https://dev.to/medusajs/how-i-created-a-react-native-ecommerce-app-for-medusas-hackathon-4am7

[^10]: https://docs.medusajs.com/modules/carts-and-checkout/backend/cart-completion-strategy

[^11]: https://docs.medusajs.com/v1/plugins/payment/paypal

[^12]: https://codehooks.io/docs/examples/webhooks/paypal

[^13]: https://docs.medusajs.com/resources/commerce-modules/payment/webhook-events

