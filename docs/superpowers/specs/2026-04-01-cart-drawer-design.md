# Header Cart Drawer + Inquiry Form Design (2026-04-01)

## 1. Scope and Confirmed Decisions

This spec defines a new website cart drawer flow triggered by the header cart icon (`views/website/global/partials/common/header.hbs`), with localization from config records and a two-phase cart strategy (guest local cart + member server cart).

Confirmed decisions from review:

- Implementation approach: **guest local cart + login-time merge to server cart**.
- Recommendation source: **by current page product category**.
- Availability: **drawer can open globally; add-to-cart only from product detail page**.
- `Next` behavior: **if not logged in, open member login modal; after login, continue to inquiry form**.
- Quantity rule: **same product add => quantity +1**.
- Guest auth rule: **guest can add to local temporary cart; `Next` enforces login**.
- Guest storage retention: **30 days auto-expiry**.
- Attribute handling in local cart: **store display snapshot only; not editable; does not participate in dedupe key**.
- Legacy model: **remove old `cart` entity/table usage and migrate to dedicated cart schema**.

Assumption/limitation for this phase:

- A single `productId` is treated as one purchasable line in cart. If business later requires multiple sellable variants under one `productId`, variant ID support and attribute-based dedupe must be introduced in a follow-up phase.

Out of scope for this phase:

- Editable per-item technical attribute selectors in drawer (voltage/capacity/application editing).
- Full anonymous server-side cart.

## 2. UX and Interaction Design

### 2.1 Entry and Drawer Mounting

- Header cart icon click opens right-side drawer panel.
- Drawer root is mounted under `body` as a global partial (not nested in header).
- New partial: `views/website/global/partials/common/cart-drawer.hbs`.
- Drawer has backdrop + panel + close icon; supports ESC and click outside to close.

### 2.2 Drawer States

Three states:

1. `empty`: empty cart illustration/text + `Continue Shopping`.
2. `list`: cart item list + remove + total count + `Next`.
3. `inquiry`: inquiry form step (same drawer, step-2).

Transition rules:

- Open drawer => load current cart and decide `empty` / `list`.
- `Continue Shopping` from `empty` => redirect to `${basePath}/products`.
- `Next` from `list`:
  - member => enter `inquiry`.
  - guest => open login modal; on login success enter `inquiry`.

### 2.3 Text Source Mapping

Config `cart-texts` (current seed sample `config_id=450`, resolved by key `cart-texts`) maps to drawer labels:

1. Continue Shopping
2. My cart
3. You might also like
4. Add +
5. Have an account?
6. Sign in
7. Next

Config `inquiry-price-form` (current seed sample `config_id=456`, resolved by key `inquiry-price-form`) maps to inquiry form labels:

1. Contact Information
2. Description paragraph
3. First Name
4. Last Name
5. E-mail
6. Phone Number
7. Address
8. Leave Message
9. Submit

If config missing/invalid: apply localized fallback strings.

## 3. Architecture and Module Boundaries

### 3.1 Frontend Modules

Create dedicated frontend modules under `public/js/`:

- `cart-drawer-store.js`
  - Local state abstraction.
  - Guest storage read/write/expiry.
  - Member API sync wrappers.
- `cart-drawer-ui.js`
  - Drawer open/close, state rendering, event delegation.
  - Empty/list/inquiry step transitions.
- `cart-drawer-api.js`
  - Fetch wrappers for cart and recommendation APIs.
- `cart-drawer-bootstrap.js`
  - Header icon binding, login hook, initialization.

Optional: merged into one file for phase-1 simplicity, but keep internal module boundaries clear.

### 3.2 Backend Modules

Add dedicated cart domain in member module:

- `member-cart.entity.ts`
- `member-cart-item.entity.ts`
- `member-cart.service.ts`
- `member-cart.controller.ts` (or add routes in `member-api.controller.ts` with clear grouping)

Remove old cart entity and usage:

- Delete `src/entities/cart.entity.ts`.
- Remove injected repository and routes that rely on old schema semantics.
- Remove old admin cart list page/routes tied to legacy table.

## 4. Data Model Design

### 4.1 Guest Local Cart (Browser)

Storage key: `pc_cart_guest_v1`.

```json
{
  "version": 1,
  "expiresAt": 1770000000000,
  "items": [
    {
      "productId": 123,
      "title": "24V Aerial Work Platform LiFePO4 Battery",
      "thumbUrl": "/uploads/...",
      "qty": 2,
      "attrs": [
        { "key": "voltage", "label": "Voltage", "value": "24V" },
        { "key": "capacity", "label": "Capacity", "value": "90-250Ah" },
        { "key": "application", "label": "Application", "value": "Forklift" }
      ],
      "addedAt": 1760000000000
    }
  ]
}
```

Rules:

- Dedup key: `productId` only.
- Re-add same product: `qty += 1`.
- `attrs` are display snapshots only, non-editable.
- TTL model: one cart-level `expiresAt` value.
- Expiry policy: on every read, if `Date.now() > expiresAt`, clear whole cart payload.
- Expiry refresh policy: any successful add/update rewrites `expiresAt = now + 30d`.

### 4.2 Server Cart Model

Use dedicated tables:

- `member_cart`
  - `id`, `user_id`, `status`, `created_at`, `updated_at`.
  - `status` follows project convention (`0 hidden / 1 normal`, no new `-1` writes).
- `member_cart_item`
  - `id`, `cart_id`, `product_id`, `qty`, `status`, `created_at`, `updated_at`.
  - Unique index: `(cart_id, product_id)`.

Notes:

- `attrs` from guest cart are **not persisted** in member cart tables in this phase.
- Member cart line display fields are resolved from product data + qty.

## 5. API Contract

Member/cart APIs (authenticated unless noted):

- `GET /api/member/cart/items`
  - Returns member cart items with product display fields.
- `POST /api/member/cart/items`
  - Body: `{ "productId": number, "qtyDelta": number }`.
  - Behavior: create or accumulate.
- `PATCH /api/member/cart/items/:itemId`
  - Body: `{ "qty": number }`.
- `DELETE /api/member/cart/items/:itemId`
  - Remove one item.
- `POST /api/member/cart/merge-guest`
  - Body: `{ "items": [{ "productId": number, "qty": number, "title"?: string, "thumbUrl"?: string, "attrs"?: [...] }] }`.
  - Merge logic: by `productId`, accumulate qty.
  - Idempotency rule: request **must include** `mergeToken`; repeated calls with same `mergeToken` must not re-accumulate.
  - Persisted fields: only validated `productId/qty` (display snapshots are ignored for persistence).

Recommendation API:

- `GET /api/website/recommend-products?categoryId=<id>&limit=<n>`
  - Primary source: same category.
  - If no category context: fallback strategy (hot products) as safe default.
  - Category source contract:
    - product detail pages inject `data-category-id` into DOM payload.
    - pages without category context call endpoint without `categoryId` and rely on fallback.

Auth/bootstrap:

- Reuse `GET /api/member/bootstrap` to detect login state and CSRF token.

Inquiry API:

- `POST /contact` (existing website contact endpoint reused by drawer inquiry form).
  - Request fields (phase-1): `firstName`, `lastName`, `email`, `phone`, `address`, `message`, plus CSRF.
  - Success: `{ ok: true, message, csrfToken? }`.
  - Failure:
    - 400 validation: `{ ok: false, message }`
    - 403 csrf/forbidden
    - 5xx/network => generic retry toast.
  - Post-success behavior (phase-1 default): clear member cart items and close drawer.

## 6. End-to-End Data Flow

### 6.1 Guest Add and Next

1. Product detail "Add +" clicked.
2. Item written to `pc_cart_guest_v1` (create or qty++).
3. Header cart count updates.
4. User clicks header cart => drawer list.
5. User clicks `Next` => if guest, open member login modal.
6. Login success callback:
   - call `merge-guest`;
   - clear local guest cart;
   - refresh member cart from server;
   - switch to inquiry form step.

### 6.2 Member Add and Inquiry

1. Product detail add calls member cart API directly.
2. Drawer list reads server items.
3. `Next` enters inquiry step directly.
4. Submit inquiry; on success, clear cart items and close drawer (fixed rule for this phase).

## 7. Error Handling and Edge Cases

- Bootstrap failure: treat as guest (non-blocking).
- Cart API timeout/failure: show toast; keep drawer open and data unchanged.
- Merge failure: keep local cart untouched; allow retry after login.
- Merge replay/double-click: rely on `mergeToken` idempotency.
- Invalid/missing product in stored local item: filter on render and heal storage.
- Config parse failure: fallback labels.
- Storage unavailable (privacy mode): in-memory fallback for current session.

## 8. Security and Compliance

- Keep CSRF for member write APIs.
- Sanitize inquiry payload server-side.
- Never trust local cart metadata except `productId/qty`; product display should be validated/refreshed from server product data when rendering member cart.

## 9. Verification and Acceptance

### 9.1 Functional Acceptance

- Header cart icon opens drawer on all website pages.
- Guest can add in product detail and see list in drawer.
- Guest `Next` forces login, then resumes into inquiry step.
- Repeated add increments qty.
- Empty state button redirects to products list page.
- Recommendation block populated by category strategy.
- Inquiry form labels come from config key `inquiry-price-form` (sample seed id `456`).
- Inquiry submit calls existing `/contact` and clears cart on success.

### 9.2 Regression and Build

- No remaining imports/usages of legacy `Cart` entity.
- Old cart admin/list routes removed or replaced.
- `npx nest build` passes.
- Member auth modal still works for existing login/register flows.

### 9.3 Manual Test Matrix

- Guest add/open/close/refresh persistence.
- TTL expiry behavior.
- Login merge idempotency.
- Merge replay test: same merge token sent twice should not double qty.
- Inquiry submit success/failure paths.
- Multi-language label rendering.
- Mobile drawer interaction and scroll lock.

## 10. Implementation Notes for Planning Phase

- Keep the new cart drawer as a standalone partial and script bundle to reduce coupling with `header.hbs`.
- Integrate with existing member-auth modal via explicit event bridge (`window` custom event or callback registry) rather than implicit DOM polling.
- Introduce clear interfaces between store, API, and renderer to keep subsequent changes (editable attributes, checkout flow) isolated.
