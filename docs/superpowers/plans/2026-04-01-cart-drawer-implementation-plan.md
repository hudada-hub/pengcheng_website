# Cart Drawer + Inquiry Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a global header cart drawer with guest local-cart (30d TTL), member server-cart, login-time merge, category-based recommendations, and inquiry-step submission using config-driven i18n labels.

**Architecture:** Add a dedicated member-cart domain (`member_cart`, `member_cart_item`, `member_cart_merge_log`) and replace legacy `cart` usage. Frontend uses a standalone drawer partial + script. Guest adds persist in `localStorage`; `Next` requires login and merges guest cart by idempotent `mergeToken`.

**Tech Stack:** NestJS + TypeORM + Fastify + Handlebars + vanilla JS + existing `member-auth.js` modal bridge.

---

## File Structure (lock before coding)

### Backend

- Create: `src/entities/member-cart.entity.ts`
- Create: `src/entities/member-cart-item.entity.ts`
- Create: `src/entities/member-cart-merge-log.entity.ts`
- Create: `src/modules/member/member-cart.service.ts`
- Create: `src/modules/member/dto/member-cart.dto.ts`
- Modify: `src/modules/member/member-api.controller.ts` (full `/api/member/cart/*`)
- Create: `src/modules/website/website-cart.controller.ts` (`GET /api/website/recommend-products`)
- Modify: `src/modules/website/website.module.ts` (register recommendation API controller)
- Modify: `src/modules/member/member.module.ts`
- Modify: `src/database/database.module.ts`
- Modify: `src/modules/admin/admin.controller.ts` (remove old cart page/delete handlers)
- Modify: `src/modules/admin/admin.module.ts` (remove old entity import)
- Modify: `src/modules/member/member-center-page.controller.ts` (switch from legacy `Cart` to new cart lines)
- Delete: `src/entities/cart.entity.ts`

### Website templates/data

- Modify: `src/modules/website/base-website.controller.ts` (add `cartTexts` + `inquiryPriceFormTexts`)
- Modify: `src/modules/website/website-layout.service.ts` (global merge config keys include `cart-texts` + `inquiry-price-form`)
- Modify: `src/modules/website/home.controller.ts`
- Modify: `src/modules/website/products.controller.ts`
- Modify: `src/modules/website/solutions.controller.ts`
- Create: `views/website/global/partials/common/cart-drawer.hbs`
- Modify: `views/website/global/partials/common/footer.hbs` (include partial + script tag)
- Modify: `views/website/global/partials/common/header.hbs` (cart trigger button)
- Modify: `views/website/global/partials/products/product-detail-main.hbs` (add-cart hook + category context)

### Frontend scripts/styles

- Create: `public/js/cart-drawer.js`
- Modify: `public/js/member-auth.js` (dispatch login success event)
- Modify: `public/css/global/common-global.css` (drawer/backdrop/list/inquiry/scroll lock)

### Tests

- Create: `src/modules/member/member.module.spec.ts`
- Create: `src/modules/member/member-cart.service.spec.ts`
- Create: `src/modules/member/member-api.cart.spec.ts`
- Create: `src/modules/website/website-cart.controller.spec.ts`
- Create: `src/modules/website/base-website.controller.spec.ts`

---

### Task 1: Replace legacy cart entity references with new cart domain skeleton

**Files:**
- Create: `src/entities/member-cart.entity.ts`
- Create: `src/entities/member-cart-item.entity.ts`
- Create: `src/entities/member-cart-merge-log.entity.ts`
- Modify: `src/database/database.module.ts`
- Modify: `src/modules/member/member.module.ts`
- Modify: `src/modules/admin/admin.module.ts`
- Delete: `src/entities/cart.entity.ts`
- Test: `src/modules/member/member.module.spec.ts`

- [ ] **Step 1: Write failing module compile test**

```ts
it('MemberModule compiles without legacy Cart entity', async () => {
  const mod = await Test.createTestingModule({ imports: [MemberModule] }).compile();
  expect(mod).toBeDefined();
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npx jest src/modules/member/member.module.spec.ts --runInBand`
Expected: FAIL due to unresolved `Cart` references.

- [ ] **Step 3: Create three new entities with BaseEntity fields**

Run: add minimal columns and unique indexes (`cart_id + product_id`, `merge_token + user_id`).

- [ ] **Step 4: Replace module/database registrations and remove old entity import**

Run: update `TypeOrmModule.forFeature` and `entities` lists.

- [ ] **Step 5: Re-run compile test and build**

Run: `npx jest src/modules/member/member.module.spec.ts --runInBand`
Expected: PASS

Run: `npx nest build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/entities/member-cart.entity.ts src/entities/member-cart-item.entity.ts src/entities/member-cart-merge-log.entity.ts src/database/database.module.ts src/modules/member/member.module.ts src/modules/admin/admin.module.ts src/entities/cart.entity.ts src/modules/member/member.module.spec.ts
git commit -m "refactor: replace legacy cart entity registrations with member cart domain"
```

---

### Task 2: Implement member cart service with required operations and idempotent merge

**Files:**
- Create: `src/modules/member/member-cart.service.ts`
- Create: `src/modules/member/dto/member-cart.dto.ts`
- Test: `src/modules/member/member-cart.service.spec.ts`

- [ ] **Step 1: Add failing test for add/list/remove/update qty**

```ts
it('addItem accumulates qty by productId', async () => { /* ... */ });
it('updateQty sets qty and rejects qty < 1', async () => { /* ... */ });
it('removeItem deletes one line', async () => { /* ... */ });
```

- [ ] **Step 2: Add failing test for merge idempotency with mergeToken**

```ts
it('mergeGuest is idempotent for same userId+mergeToken', async () => { /* ... */ });
```

- [ ] **Step 3: Run tests to confirm fail**

Run: `npx jest src/modules/member/member-cart.service.spec.ts --runInBand`
Expected: FAIL (service not implemented).

- [ ] **Step 4: Implement `ensureCart` + `addItem`**

Run: create/get member cart and upsert product line by accumulation.

- [ ] **Step 5: Implement `getItems` + `updateQty` + `removeItem` + `clearAll`**

Run: include status filtering and basic validation.

- [ ] **Step 6: Implement `mergeGuest(userId, mergeToken, items)`**

Run: insert merge log first; if duplicate token, short-circuit success without re-accumulation.

- [ ] **Step 7: Re-run tests**

Run: `npx jest src/modules/member/member-cart.service.spec.ts --runInBand`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/member/member-cart.service.ts src/modules/member/dto/member-cart.dto.ts src/modules/member/member-cart.service.spec.ts
git commit -m "feat: implement member cart service with idempotent guest merge"
```

---

### Task 3: Implement complete member cart API contract

**Files:**
- Modify: `src/modules/member/member-api.controller.ts`
- Test: `src/modules/member/member-api.cart.spec.ts`

- [ ] **Step 1: Add failing API tests for all endpoints**

```ts
GET /api/member/cart/items
POST /api/member/cart/items
PATCH /api/member/cart/items/:itemId
DELETE /api/member/cart/items/:itemId
POST /api/member/cart/merge-guest
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `npx jest src/modules/member/member-api.cart.spec.ts --runInBand`
Expected: FAIL (missing routes/behavior).

- [ ] **Step 3: Add endpoint handlers with auth and CSRF**

Run: use service methods; enforce mergeToken required (400 if absent).

Run: `POST /api/member/cart/merge-guest` body example:
`{ "mergeToken": "uuid-or-ts", "items": [{ "productId": 1001, "qty": 2, "title": "...", "thumbUrl": "...", "attrs": [{ "k": "Voltage", "v": "48V" }] }] }`

- [ ] **Step 4: Remove legacy `saveCart` endpoint and old `Cart` repository usage**

Run: delete old method and injections cleanly.

- [ ] **Step 5: Re-run tests**

Run: `npx jest src/modules/member/member-api.cart.spec.ts --runInBand`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/member/member-api.controller.ts src/modules/member/member-api.cart.spec.ts
git commit -m "feat: add full member cart api and remove legacy cart endpoint"
```

---

### Task 4: Remove legacy cart admin/member-center dependencies

**Files:**
- Modify: `src/modules/admin/admin.controller.ts`
- Modify: `src/modules/member/member-center-page.controller.ts`

- [ ] **Step 1: Remove `/admin/cart` page and delete handler references**

Run: delete `cartPage` + `cartDelete` routes and old repository usage.

- [ ] **Step 2: Replace member center cart list source with new member cart lines**

Run: map list rows from `member_cart_item` (+ product lookups if needed).

- [ ] **Step 3: Build to verify no `Cart` symbol remains**

Run: `npx nest build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/admin/admin.controller.ts src/modules/member/member-center-page.controller.ts
git commit -m "refactor: remove legacy cart dependencies from admin and member center"
```

---

### Task 5: Expose cart and inquiry texts in common website context

**Files:**
- Modify: `src/modules/website/base-website.controller.ts`
- Modify: `src/modules/website/website-layout.service.ts`
- Modify: `src/modules/website/home.controller.ts`
- Modify: `src/modules/website/products.controller.ts`
- Modify: `src/modules/website/solutions.controller.ts`
- Test: `src/modules/website/base-website.controller.spec.ts`

- [ ] **Step 1: Write failing context test**

```ts
it('includes cartTexts and inquiryPriceFormTexts in common data', async () => { /* ... */ });
```

- [ ] **Step 2: Run test and confirm fail**

Run: `npx jest src/modules/website/base-website.controller.spec.ts --runInBand`
Expected: FAIL (missing fields).

- [ ] **Step 3: Implement parser helpers + type fields**

Run: parse config keys `cart-texts`, `inquiry-price-form` with fallback labels.

- [ ] **Step 4: Ensure all pages can fetch the two config keys**

Run: in `website-layout.service.ts`, globally merge `cart-texts` and `inquiry-price-form` into requested `configKeys` (same strategy as `login-register` and `fixed-four-icon`) to avoid per-controller omissions.

- [ ] **Step 5: Pass fields through explicit payload builders**

Run: update `homeViewTemplateData`, products payload, solutions payload.

- [ ] **Step 6: Re-run test/build**

Run: `npx jest src/modules/website/base-website.controller.spec.ts --runInBand`
Expected: PASS

Run: `npx nest build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/website/base-website.controller.ts src/modules/website/website-layout.service.ts src/modules/website/home.controller.ts src/modules/website/products.controller.ts src/modules/website/solutions.controller.ts src/modules/website/base-website.controller.spec.ts
git commit -m "feat: add cart and inquiry text mappings to website common context"
```

---

### Task 6: Add recommendation API by category fallback

**Files:**
- Create: `src/modules/website/website-cart.controller.ts`
- Modify: `src/modules/website/website.module.ts`
- Test: `src/modules/website/website-cart.controller.spec.ts`

- [ ] **Step 1: Write failing controller tests**

```ts
it('returns same-category products when categoryId exists', async () => { /* ... */ });
it('falls back to hot products when categoryId missing', async () => { /* ... */ });
```

- [ ] **Step 2: Run tests and confirm fail**

Run: `npx jest src/modules/website/website-cart.controller.spec.ts --runInBand`
Expected: FAIL.

- [ ] **Step 3: Implement `GET /api/website/recommend-products`**

Run: support `categoryId` and `limit`, return product cards needed by drawer.

- [ ] **Step 4: Register controller in website module**

Run: update module metadata.

- [ ] **Step 5: Re-run tests**

Run: `npx jest src/modules/website/website-cart.controller.spec.ts --runInBand`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/website/website-cart.controller.ts src/modules/website/website.module.ts src/modules/website/website-cart.controller.spec.ts
git commit -m "feat: add website recommendation api for cart drawer"
```

---

### Task 7: Build drawer partial and wire trigger/script loading

**Files:**
- Create: `views/website/global/partials/common/cart-drawer.hbs`
- Modify: `views/website/global/partials/common/footer.hbs`
- Modify: `views/website/global/partials/common/header.hbs`

- [ ] **Step 1: Create drawer markup with 3 steps (`empty/list/inquiry`)**

Run: include ids/data hooks for JS rendering and accessibility labels.

- [ ] **Step 2: Include partial under body-level overlays**

Run: add `{{> website/global/common/cart-drawer}}` in footer include area.

- [ ] **Step 3: Add script tag with deterministic order**

Run: in footer, load `member-auth.js` first, then `cart-drawer.js` with `defer`.

- [ ] **Step 4: Convert header cart icon to trigger button**

Run: add `id="pcNavCartTrigger"` and prevent direct navigation.

- [ ] **Step 5: Build verification**

Run: `npx nest build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add views/website/global/partials/common/cart-drawer.hbs views/website/global/partials/common/footer.hbs views/website/global/partials/common/header.hbs
git commit -m "feat: wire global cart drawer trigger, partial, and script loading"
```

---

### Task 8: Add product-detail add-to-cart hooks and category context

**Files:**
- Modify: `views/website/global/partials/products/product-detail-main.hbs`

- [ ] **Step 1: Add add-to-cart action hook in detail page**

Run: add `data-action="add-cart"` hook on detail add button.

- [ ] **Step 2: Inject `data-category-id` context**

Run: ensure drawer JS can read current category id from detail page DOM.

- [ ] **Step 3: Manual fail-then-pass check**

Run before JS implementation: click does nothing.
Run after JS implementation: item enters drawer list.

- [ ] **Step 4: Commit**

```bash
git add views/website/global/partials/products/product-detail-main.hbs
git commit -m "feat: add product detail hooks for cart add and category context"
```

---

### Task 9: Implement frontend cart drawer logic + login bridge + scroll lock

**Files:**
- Create: `public/js/cart-drawer.js`
- Modify: `public/js/member-auth.js`
- Modify: `public/css/global/common-global.css`

- [ ] **Step 1: Implement guest store primitives and TTL**

Run: `readGuestCart`, `writeGuestCart`, expiry clear, qty accumulation by `productId`.

- [ ] **Step 2: Implement member API client wrapper**

Run: call all member cart endpoints and recommendation endpoint with error normalization.

- [ ] **Step 3: Implement drawer state machine (`empty/list/inquiry`)**

Run: open/close, backdrop click, ESC, and body scroll lock.

- [ ] **Step 4: Implement `Next` flow with auth gate**

Run: guest -> open auth modal; member -> inquiry.

- [ ] **Step 4.1: Implement detail-page add behavior by auth status**

Run: if logged in, detail add uses `POST /api/member/cart/items`; if guest, write guest local cart. Both paths refresh drawer list source correctly.

- [ ] **Step 5: Emit + consume login success event**

Run: in `member-auth.js` dispatch `pc:member-login-success`; in drawer subscribe and continue merge/inquiry.

- [ ] **Step 6: Implement merge with required `mergeToken`**

Run: generate token once per guest-next attempt; clear local cart only on successful merge.

- [ ] **Step 7: Implement inquiry submit chain**

Run: submit inquiry form to `/contact` with CSRF; on success clear cart (member -> service clear/delete path, guest -> clear local cart), close drawer, and show success text.

- [ ] **Step 8: Run manual integration checks**

Run:
- guest add and persist (refresh page)
- guest next -> login -> merge -> inquiry
- remove item / update qty path
- recommendation fallback path
- logged-in detail add goes to member API, refresh keeps cart
- inquiry submit success clears cart and closes drawer

- [ ] **Step 9: Commit**

```bash
git add public/js/cart-drawer.js public/js/member-auth.js public/css/global/common-global.css
git commit -m "feat: implement cart drawer frontend flow with auth bridge and merge"
```

---

### Task 10: Final verification and safe completion commit

**Files:**
- Modify (if needed): `docs/superpowers/specs/2026-04-01-cart-drawer-design.md`
- Modify (if needed): `docs/superpowers/plans/2026-04-01-cart-drawer-implementation-plan.md`

- [ ] **Step 0: Add production DB rollout note**

Run: provide SQL/migration note for `member_cart`, `member_cart_item`, `member_cart_merge_log` because production has `synchronize: false`.

- [ ] **Step 1: Run build and targeted tests**

Run: `npx nest build`
Expected: PASS

Run: `npx jest src/modules/member/member.module.spec.ts src/modules/member/member-cart.service.spec.ts src/modules/member/member-api.cart.spec.ts src/modules/website/website-cart.controller.spec.ts src/modules/website/base-website.controller.spec.ts --runInBand`
Expected: PASS

- [ ] **Step 2: Run acceptance checklist**

Validate:
- no legacy `Cart` references remain
- global drawer works on all pages
- add-only on product detail
- guest local cart 30d TTL
- next -> login -> idempotent merge -> inquiry
- submit inquiry clears cart
- labels from keys `cart-texts` / `inquiry-price-form`

- [ ] **Step 3: Commit with explicit file paths only**

```bash
git add src/entities/member-cart.entity.ts src/entities/member-cart-item.entity.ts src/entities/member-cart-merge-log.entity.ts src/modules/member/member-cart.service.ts src/modules/member/member-api.controller.ts src/modules/website/website-cart.controller.ts views/website/global/partials/common/cart-drawer.hbs public/js/cart-drawer.js public/css/global/common-global.css
git commit -m "feat: deliver cart drawer, member cart domain, and inquiry flow"
```
