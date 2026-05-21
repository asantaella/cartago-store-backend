# Pagos con Bizum

Learn about Bizum, a real-time payment method in Spain.

Bizum is a real-time payment system in Spain. When making a payment with Bizum, the buyer enters the phone number they’ve registered with Bizum and authenticates and approves the payment in their bank’s app directly.

#### Payment method properties

- **Customer locations**

  Spain

- **Presentment currencies**

  EUR

- **Payment confirmation**

  Customer-initiated

- **Payment method family**

  Real-Time Payment

- **Recurring payments**

  No

- **Payout timing**

  Standard

- **Connect support**

  Yes

- **Dispute support**

  [ Yes ](https://docs.stripe.com/payments/bizum.md?utm_source=copilot.com#disputed-payments)

- **Manual capture support**

  No

- **Refunds / Partial refunds**

  [ Yes ](https://docs.stripe.com/payments/bizum.md?utm_source=copilot.com#refunds) / [ Yes ](https://docs.stripe.com/payments/bizum.md?utm_source=copilot.com#refunds)

#### Business locations

Stripe accounts in the following countries can accept Bizum payments that settle in a [supported currency](https://docs.stripe.com/payments/bizum.md?utm_source=copilot.com#supported-currencies).

- AT
- AU
- BE
- CA
- CH
- CZ
- DE
- DK
- ES
- FI
- FR
- GB
- GR
- HU
- IE
- IT
- LT
- LU
- NL
- NO
- PL
- PT
- RO
- SE
- SG
- SI
- SK
- US

#### Product support

- Connect
- Payment Links
- Checkout1
- [Elements](https://docs.stripe.com/payments/bizum/accept-a-payment.md?payment-ui=elements&api-integration=checkout&utm_source=copilot.com)2

1Not supported when using Checkout in subscription mode or setup mode.

2Express Checkout Element doesn’t support Bizum.

## Empezar

No tienes que integrar Bizum y otros métodos de pago individualmente. Si utilizas nuestros productos de front-end, Stripe determina automáticamente los métodos de pago más relevantes que se deben mostrar. Ve al [Dashboard de Stripe](https://dashboard.stripe.com/settings/payment_methods) y habilita Bizum. Para empezar a utilizar una de nuestras interfaces de usuario alojadas, sigue un inicio rápido:

- [Checkout](https://docs.stripe.com/checkout/quickstart.md?utm_source=copilot.com): Nuestra página de proceso de compra prediseñada y alojada.
- [Elements](https://docs.stripe.com/payments/quickstart-checkout-sessions.md?utm_source=copilot.com): Our drop-in UI components.

### Otros productos de pago

Los siguientes productos de Stripe también te permiten añadir Bizum desde el Dashboard:

- [Payment Links](https://docs.stripe.com/payment-links.md?utm_source=copilot.com)

Si tu integración requiere enumerar manualmente métodos de pago, descubre cómo [ configurar Bizum](https://docs.stripe.com/payments/bizum/accept-a-payment.md?utm_source=copilot.com). 

## Opciones de pago

El límite de cargo mínimo es de 0.50 EUR o el equivalente para otras divisas aceptadas.

El límite de cargo máximo es de 5,000.00 EUR o el equivalente para otras divisas aceptadas.

## Prohibited and restricted business categories

Además de las categorías de bienes o servicios vendidos y empresas [restringidas de utilizar Stripe en general](https://stripe.com/restricted-businesses), las siguientes categorías tienen prohibido usar Bizum:

- Marchantes y galerías de arte
- Pago de fianzas
- Apuestas/juegos de casino
- Organizaciones benéficas y servicios sociales: recaudación de fondos
- Entidades financieras
- Casinos en línea con licencia del gobierno (apuestas en línea)
- Carreras de caballos/perros con licencia del gobierno
- Loterías del gobierno (solo en la región de EE. UU.)
- Joyerías, relojerías y tiendas de platería
- Cambio y monederos de criptomonedas
- Compra/carga de tarjetas de valor guardado no pertenecientes a entidades financieras
- Organizaciones políticas
- Piedras y metales preciosos, relojes y joyas
- Organizaciones religiosas
- Agentes de valores y corredores de bolsa
- Servicios a tiempo compartido
- Reparación de relojes/joyas
- Otras categorías a discreción de Bizum

## Additional requirements

Make sure you comply with the following Bizum requirements *before* requesting access to Bizum as a payment method in the [Dashboard](https://dashboard.stripe.com/settings/payment_methods) or through the [capabilities API](https://docs.stripe.com/api/capabilities.md?utm_source=copilot.com).

- **Companies**: Provide a valid tax identification number for your country using the [`company.tax_id`](https://docs.stripe.com/api/accounts/object.md?utm_source=copilot.com#account_object-company-tax_id) field. Alternatively, you can provide a VAT ID using the [`company.vat_id`](https://docs.stripe.com/api/accounts/object.md?utm_source=copilot.com#account_object-company-vat_id) field.
- **Individuals and sole proprietors**: Provide a valid personal identification number using the [`individual.id_number`](https://docs.stripe.com/api/persons/object.md?utm_source=copilot.com#person_object-id_number) field.
  - **Spain**: Provide your [DNI](https://sede.policia.gob.es/dni-y-pasaporte/) (Documento Nacional de Identidad) or [NIE](https://sede.policia.gob.es/dni-y-pasaporte/) (Número de Identificación de Extranjero) if you are a foreign resident.
  - **Other supported countries**: Provide the standard personal identification number for your country.

You must also set the [`business_type`](https://docs.stripe.com/api/accounts/object.md?utm_source=copilot.com#account_object-business_type) on your account.

If you use the Dashboard, you can provide these details in your [tax settings](https://dashboard.stripe.com/settings/taxation). After you request the Bizum capability, any outstanding requirements appear in your account status with a link to the relevant settings page.

> The Bizum payments capability stays in a `pending` state until compliance with Bizum onboarding requirements is verified. Contact [Stripe support](https://support.stripe.com/contact) if you’re unsure about your Bizum payments capability status.

## Disputas

Bizum has a claims process that allows transaction disputes. Customers can open disputes for cases of suspected fraud, double payments, or a difference between an order and a transaction amount. Customers can initiate a dispute within 120 calendar days of the transaction.

Después de que el cliente inicie una disputa, Stripe te notifica mediante:

- Correo electrónico
- El Dashboard de Stripe
- Un evento de API `charge.dispute.created` (si tu integración está configurada para recibir [webhooks](https://docs.stripe.com/webhooks.md?utm_source=copilot.com))

Stripe retiene el importe disputado de tu saldo hasta que Bizum resuelva la disputa.

Te pedimos que subas pruebas convincentes que demuestren que has completado la orden de compra [utilizando el Dashboard de Stripe](https://docs.stripe.com/disputes/responding.md?utm_source=copilot.com#respond). En estas pruebas se puede incluir lo siguiente:

- ID de seguimiento
- Fecha de envío
- Registro de compra de bienes intangibles, como por ejemplo una dirección IP o un recibo por correo electrónico
- Registro de compra de servicios o bienes físicos, como por ejemplo un número de teléfono o un acuse de recibo
- Registro de reembolso (para la compra que ya has reembolsado)

Para manejar las disputas de forma programática, [responde a las disputas usando la API](https://docs.stripe.com/disputes/api.md?utm_source=copilot.com).

This information helps Bizum determine if a dispute is valid. Make sure the evidence you provide contains as much detail as possible from what the customer provided at checkout. You must submit the requested information within 40 calendar days. Bizum provides a decision within 90 calendar days. If Bizum resolves the dispute with you winning, we return the disputed amount to your Stripe balance. If Bizum rules in favor of the customer, the disputed amount stays with the customer.

## Reembolsos

Bizum admite reembolsos totales y parciales.

- El período de reembolso es de hasta 395 días después de la compra.
- Los reembolsos de pagos Bizum son asíncronos y tardan hasta 5 minutos en completarse.

Stripe te notifica el estatus final reembolso usando el evento *webhook* (A webhook is a real-time push notification sent to your application as a JSON payload through HTTPS requests) `refund.updated` o `refund.failed`. Cuando un reembolso se realiza correctamente, el estatus del objeto [Reembolsar](https://docs.stripe.com/api/refunds/object.md?utm_source=copilot.com) pasa a `succeeded`. Si un reembolso falla (el estatus del objeto `Refund` pasa a `failed`), entonces devolvemos el importe a tu saldo de Stripe y debes buscar una forma alternativa de reembolsar a tu cliente.

## Connect

Si usas *Connect* (Connect is Stripe's solution for multi-party businesses, such as marketplace or software platforms, to route payments between sellers, customers, and other recipients), debes tener en cuenta lo siguiente antes de habilitar y usar Bizum.

### Solicita funcionalidades de Bizum para tus cuentas conectadas

Configura las funcionalidades `bizum_payments` como `active` en la cuenta de tu plataforma y en cualquier cuenta conectada en la que quieras habilitar Bizum. También puedes [solicitar más funcionalidades para la cuenta](https://docs.stripe.com/connect/account-capabilities.md?utm_source=copilot.com#requesting-unrequesting).

### Comerciante registrado y descripciones de cargos en el extracto bancario

El [tipo de cargo](https://docs.stripe.com/connect/charges.md?utm_source=copilot.com) de los pagos de Connect puede cambiar la descripción predeterminada del cargo en el extracto bancario, así como el nombre del comerciante que aparece en la aplicación bancaria del cliente y en los correos electrónicos de confirmación.

| Tipo de cargo                                            | Descripción del cargo recogida de |
| -------------------------------------------------------- | --------------------------------- |
| Directo                                                  | Cuenta conectada                  |
| Destino                                                  | Plataforma                        |
| Cargo y envíos de fondos separados                       | Plataforma                        |
| Destino (con `on_behalf_of`)                             | Cuenta conectada                  |
| Cargos y envíos de fondos separados (con `on_behalf_of`) | Cuenta conectada                  |

To check or update your statement descriptor, go to your [account settings](https://docs.stripe.com/get-started/account/statement-descriptors.md?utm_source=copilot.com). For Connect integrations, see [setting statement descriptors with Connect](https://docs.stripe.com/connect/statement-descriptors.md?utm_source=copilot.com).

## Divisas aceptadas

Bizum only supports payments in `eur`.

- eur: AT, BE, CZ, DE, DK, ES, FI, FR, GR, HU, IE, IT, LT, LU, NL, NO, PL, PT, RO, SE, SI, SK
- eur: CH
- eur: GB
- eur: US
- eur: SG
- eur: AU
- eur: CA