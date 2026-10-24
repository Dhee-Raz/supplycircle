# SupplyCircle

A collaborative purchasing and stock-request application for businesses operating multiple local stores with several owners or partners.

Store employees report missing or low-stock items, identifying their store, requested quantity, and urgency. Owners and partners coordinate purchases or dealer orders through shared lists, track responsibility, and update progress to reduce duplicate ordering. The long-term workflow distinguishes requested, claimed, ordered, and received items; not all of these stages are implemented yet.

## Accounts and access

- Register with an email address **or** an international phone number and a password (15–128 characters).
- Choose a unique username. Each account also receives a permanent UUID.
- Sign-in uses that registered email or phone and password. Email/SMS verification, password recovery, and adding a second sign-in contact are not included.
- Owners create invitation links for a specific email or phone. Invitees sign in with that contact and accept the link. Links expire after seven days and can be used once. No invitation email or SMS is sent automatically.
- Owners can rename stores and change locations in the Stores tab.
- Owners assign employees to individual stores during invitation and can reassign them in the Team tab. Employees see and report stock only for their assigned store. Owners and partners work across all stores. Everyone can edit their own display name and username in their profile.
- Request and purchase records retain the actor's account ID, even if their display name changes later.
- A person currently belongs to one business workspace.

Passwords use salted scrypt (N=32768, r=8, p=3). Session tokens are random, stored as SHA-256 hashes, expire after seven days, and are sent in HttpOnly/SameSite cookies (Secure on HTTPS). Auth requests have database-backed attempt limits. APIs check membership and roles on the server. Authentication and workspace responses use no-store caching.

## Local development

Requires Node 22.13+.

```sh
npm run install:ci
npm run db:generate
npm run build
```

Apply pending migration files once, in filename order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_aberrant_maestro.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_easy_lester.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_employee_store_assignment.sql
npm start
```

Open the printed localhost URL. New workspaces start empty; no sample stores, stock, or people are seeded. Local database contents are ignored by Git and are separate from hosted data.

`npm run dev` starts the development server. After migration/schema changes, rebuild the Worker config before local database commands. Use `npx tsc --noEmit` to check types.

## Integration check

Run the built server with a disposable database, then run:

```sh
node scripts/test-app.mjs http://127.0.0.1:8788
```

The check creates test accounts and records. Use a disposable test database, never a production app URL. It verifies account uniqueness, password login, sessions, invitations, roles, workspace isolation, store editing, and purchase history. Sprint 1's new store-assignment behavior requires additional end-to-end verification.

## Hosting

This checkout retains its Sites/Cloudflare integration and D1 migrations in `.openai/hosting.json` and `drizzle/`. Publishing applies pending hosted schema migrations.

The existing private hosted Site has an outer ChatGPT access policy. App login does not bypass that policy: users need permission to open the Site before signing into SupplyCircle. Changing the Site's audience or moving to another host is a separate deployment change.

Existing ChatGPT workspace contacts can link to an app account only while the matching verified ChatGPT identity is present. Contact strings alone cannot claim existing workspace membership.

## Sprint 2: stock requests

Employees can submit stock requests for their assigned store with item name, quantity, unit, category, urgency, and optional notes. Pending requests can be edited or deleted by their creator; owners and partners may also manage pending requests. Purchased requests remain in purchase history and cannot be edited or deleted. The server enforces these permissions independently of the interface.

## Sprint 3: purchasing coordination

Owners and partners can atomically claim an unclaimed request, mark it ordered, and mark it received. Only the purchaser who claimed a request can release it, order it, or receive it. Competing claims are rejected with HTTP 409 to prevent duplicate purchase ownership. The existing direct **bought** status remains supported for historical compatibility. Received requests are retained in purchase history. No supplier or invoice tracking is included yet.

CI runs API integration tests against a disposable local D1 database; a passing build alone is not a passing integration test.

## Sprint 4 — Supplier management

Owners and partners can add, edit and deactivate suppliers, including phone, email and address. A purchaser can assign an active supplier to a claimed request and record an order reference and expected delivery date after ordering. Suppliers and purchases are scoped to the business workspace; employees cannot manage suppliers. Apply `drizzle/0003_suppliers.sql` after earlier migrations before running the updated app.

## Sprint 5 — Notifications and delivery tracking

Urgent stock requests create in-app notifications for owners and partners; purchase and delivery changes notify the requesting employee. Notifications are workspace- and recipient-scoped and can be marked read. Purchasers can record in-transit, delayed, and delivered updates with an optional note on ordered items. The app refreshes its data every 15 seconds while visible; notifications are in-app only (no email, SMS, or push integration). Run `drizzle/0004_notifications_delivery.sql` after prior migrations.
