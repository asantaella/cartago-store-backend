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

Code: `src/utils/nif-cif-requirement.ts` (rule),
`src/api/middlewares/nif-cif-on-payment-session.ts` (routes).

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

- A cart that becomes non-compliant **after** a payment session was selected (NIF/CIF removed
  from the address, or items added past €400) keeps its selected session: Medusa refreshes
  sessions in-process on `POST /store/carts/:id` and line-item changes, bypassing the
  selection middleware. The storefront revalidates the active cart before paying, so only a
  client that bypasses the storefront can reach this path. Releasing the session from a
  `cart.updated` subscriber was rejected: the stored session status stays `pending` after the
  customer confirms in Stripe, so it could cancel a payment already in flight.
- The rule reads the currency from `cart.region.currency_code`: Medusa v1 carts have no
  `currency_code` of their own.
