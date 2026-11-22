# NIF/CIF requirement for EUR carts of €400 or more

EUR carts whose total is **€400 or more** (`total >= 40000` minor units) must carry a
non-blank NIF/CIF in `shipping_address.metadata.nif_cif` or
`billing_address.metadata.nif_cif`.

The storefront enforces the rule in checkout (`src/modules/checkout/nif-validation.ts` in
`cartago-store-frontend`). The backend enforces it **before any payment exists**, so a client
that skips the storefront cannot get a payable session.

## Where the backend enforces it

| Point | Behavior |
| --- | --- |
| `POST /store/carts/:id/payment-session` | Rejected with `400 nif_cif_required` |
| `POST /store/carts/:id/payment-session-context` | Rejected with `400 nif_cif_required` |
| `POST /store/carts/:id/payment-sessions/:provider_id` | Rejected with `400 nif_cif_required` |
| `POST /store/carts/:id/payment-sessions/:provider_id/refresh` | Rejected with `400 nif_cif_required` |
| `cart.updated` event | The selected payment session is deleted when it is still `pending` and the cart no longer complies |

Code: `src/utils/nif-cif-requirement.ts` (rule),
`src/api/middlewares/nif-cif-on-payment-session.ts` (routes),
`src/subscribers/cart-nif-cif-payment-session.ts` (cart updates).

## Error contract

```json
HTTP 400
{
  "type": "not_allowed",
  "code": "nif_cif_required",
  "message": "A NIF/CIF is required on the shipping or billing address for orders of €400 or more."
}
```

Clients should map `code: "nif_cif_required"` to the address step so the customer can enter
the NIF/CIF.

## Deliberately not enforced

- `POST /store/carts/:id/payment-sessions` (create): the storefront creates sessions while
  rendering checkout and renders nothing if that call fails, which would hide the address step
  where the NIF/CIF is entered. Creating sessions moves no money; only the selected session is
  paid.
- `POST /store/carts/:id/complete` and the Stripe webhook completion: by then the customer has
  already paid, so rejecting would leave a charge without an order.

## Known limits

- The `cart.updated` subscriber runs on the Redis event bus, so there is a short window between
  a cart update and the session release. The storefront revalidates the active cart before
  paying, which covers that window.
- An `authorized` session (payment in flight) is never released.
- The rule reads the currency from `cart.region.currency_code`: Medusa v1 carts have no
  `currency_code` of their own.
