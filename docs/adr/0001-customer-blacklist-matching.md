# Store Customer blacklist status as a first-class field and evaluate Order matches server-side

**Status:** accepted

Customers store blacklist status in a dedicated non-nullable `in_black_list` boolean column with a default of `false`, rather than in metadata. Order blacklist detection is evaluated server-side using the direct Customer association or an OR match across normalized email, phone, and NIF/CIF identity data. The derived `customer_in_black_list` indicator is calculated live when Orders are listed. This keeps the filtering and matching behavior consistent across clients and avoids loading the complete blacklist into the admin UI.

## Consequences

- Existing Customers remain unlisted by default and are migrated with `in_black_list = false`.
- The standard admin Customer update flow must accept and persist the new field.
- The Orders API must always expose the computed `customer_in_black_list` indicator for the main Orders table.
- Email and NIF/CIF matching is case/format normalized; Spanish phones may match by their last nine digits after removing formatting.
- The admin UI renders matching Order rows with a light-red background and offers All, Black list, and Not in black list Customer filters.
- Blacklist status is informational in this feature and does not block checkout, Orders, payments, or fulfillment.
