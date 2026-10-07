# Customer Search Pagination Performance

## Objective

Fix pagination for the live admin customer endpoint in this repository so `/a/customers?offset=0&limit=15` fetches and renders a bounded customer page instead of the full dataset.

## Problem and evidence

- The actual backend workspace is `/home/parker/workspace/cartago-store-backend`, branch `release/1.9.2`.
- The authenticated dashboard previously requested `/admin/customers?expand=orders&offset=0&limit=15` and received `count: 4021` with `customers.length: 4021`; the UI rendered 4,021 rows.
- A matching query `q=Alejandro` returned 42 customers despite `limit=15`; `q=Alejandro Fern` had no matches in the current data.
- The actual route imported `buildQuery` from `@medusajs/utils` and passed its result directly to TypeORM `CustomerRepository.find`. The builder nests pagination under module-DAL options, whereas TypeORM requires top-level `take` and `skip`.
- A prior attempt changed a duplicate route under `cartago-ecommerce/apps/store-backend`; that workspace is not the live backend and its changes are preserved but do not satisfy this feature.

## Scope and constraints

- Modify only `src/api/admin/customers/route.ts` and the existing `src/api/admin/customers/route.spec.ts` in this repository.
- Preserve the actual route's accent-insensitive customer-name search, `phone`, `in_black_list`, group filtering, expanded relations, sort order, and total-count response semantics.
- Do not modify the sibling `cartago-ecommerce` repository or restart the running backend/dashboard.
- Do not print customer names, emails, IDs, response bodies, cookies, or authorization headers in verification output.
- No commit is authorized by the user at this point.

## Tasks

- [x] **CSB-1 — Add a failing pagination assertion to the existing route handler test.** The regression expects top-level TypeORM `take`/`skip`, expanded relations, and descending ordering. RED was observed before the route change.
- [x] **CSB-2 — Use the TypeORM-compatible Medusa query builder in the actual route.** Changed the import to `@medusajs/medusa/dist/utils/build-query`, preserving the custom route behavior. The writer's focused test and TypeScript check passed.
- [x] **CSB-3 — Run independent risk-gated verification.** A separate verifier repeated the focused route test and TypeScript check successfully after native ASSESS returned `unassessable`.
- [ ] **CSB-4 — Complete live API and dashboard verification.** The authenticated CDP endpoint is unavailable, so response pagination and DOM row counts remain unverified.

## Acceptance criteria

- Requests with `limit=15` and `offset=0` return at most 15 customers while `count` reports the total matches.
- Requests with `offset=15` return the next page without overlap.
- Existing query/filter behavior and response metadata remain intact.
- The focused route test passes independently; live checks expose only aggregate metadata and row counts.

## Verification plan and evidence

- Focused test: `yarn test src/api/admin/customers/route.spec.ts --runInBand`
  - RED before route fix: regression failed because the old builder emitted nested `options.limit/offset` and `populate`, not top-level TypeORM pagination and relations.
  - GREEN after route fix: 4 tests passed, including existing blacklist, accent-normalization, and invalid-filter tests.
- TypeScript: `yarn tsc --noEmit --pretty false -p tsconfig.json` passed in the writer run.
- Native ASSESS returned `unassessable` because untracked files were not explicitly declared. RDD is on; the returned high-risk plan required writer self-verification and a separate independent verifier. Both writer and independent verification passed.
- Independent focused test: `yarn test src/api/admin/customers/route.spec.ts --runInBand` passed with 1 suite and 4 tests.
- Independent TypeScript check: `yarn tsc --noEmit --pretty false -p tsconfig.json` passed with no output. Parent `git diff --check` also passed.
- Live Chrome CDP check after fix: pending. The authenticated endpoint `127.0.0.1:9222` is not listening from parent or verifier; no browser/service was launched or restarted. Backend reload and live row counts remain unverified.
- Engram mirror: pending; no Engram/memory save tool is available in this session.
- Commit: not created; the user has not requested a commit.
- Next step: reconnect the existing authenticated CDP endpoint, then check unfiltered and matching API page counts plus dashboard DOM rows.
