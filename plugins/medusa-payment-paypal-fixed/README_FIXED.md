# medusa-payment-paypal-fixed

Fork local del plugin medusa-payment-paypal v6.0.5 con fix para webhooks CAPTURE.

## Bug Solucionado
El plugin original no distingue entre eventos CAPTURE y AUTHORIZATION en webhooks, causando error 409.

## Cambios
- Detecta event_type en el webhook
- Para CAPTURE: usa order_id del supplementary_data
- Para AUTHORIZATION: usa el flujo original

## Basado en
medusa-payment-paypal v6.0.5
https://github.com/medusajs/medusa/tree/v1.20.11/packages/medusa-payment-paypal
