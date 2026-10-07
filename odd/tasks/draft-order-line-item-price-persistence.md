# Draft order line item price persistence

## Objective
Allow administrators to modify the original price of Draft Order cart line items without the save flow restoring the previous price.

## Confirmed decisions
- Cover both updating an existing line item and adding/merging into an existing line item.
- An explicitly supplied `unit_price` becomes the line item's new canonical/original price.
- Keep normal tax and surcharge application using the new price.
- Regression coverage must verify the immediate response and a subsequent persisted Draft Order read.
- Preserve legitimate standard-pricing restoration when the tax territory changes.

## Tasks
1. Add failing regression tests for explicit price edits through both administrative line-item flows, including persistence and pricing metadata.
2. Implement canonical price metadata handling so explicit `unit_price` edits survive pricing normalization while tax/surcharge calculations remain active.
3. Run focused tests and static checks, review the diff, and document any remaining checks or limitations.

## Status
- Task 1 complete: regression tests added for explicit price edits in both administrative flows and standard-price restoration.
- RED observed, then resolved: the new update and merge tests initially failed because pricing metadata restored the old price.
- Task 2 complete: shared canonical price handling now updates unit price metadata in both flows while retaining tax/surcharge normalization.
- Task 3 complete: focused tests, TypeScript typecheck, diff checks, and native reliability review passed.
- Native review advisory: R3-001 is informational/non-blocking; no correction was requested.
- Delivery commit intentionally pending explicit user authorization.
