# Customer Blacklist Context

This context defines how the system identifies Customers that must be treated as blacklisted and how that status is related to Orders.

## Language

**Customer**:
A person or organization represented in the commerce system and associated with customer-facing order information.

**Blacklisted Customer**:
A Customer whose `in_black_list` status is `true`.
_Avoid_: Banned customer, blocked account

**Blacklist match**:
A match between an Order and a Blacklisted Customer through the configured customer identity data, or through the Order's direct Customer association.

**Customer identity data**:
The email, phone number, and NIF/CIF values used to associate an Order with a Customer.

**NIF/CIF**:
The Spanish tax identifier stored in `metadata.nif_cif`.

**Order**:
A persisted purchase record whose customer identity data may be used to detect a Blacklist match.
