# Solarize CRM TEST

This repo can now run as a separate `Solarize CRM TEST` workspace without changing production code or production data.

## What this gives us

- A separate app identity in the UI so the test instance is visually obvious
- A clean bootstrap path for a fresh test database
- A repeatable local startup script that loads `.env.test.local`

## 1. Create a test env file

Copy [.env.test.example](C:/Users/tomyo/Projects/solarize-ops/.env.test.example) to `.env.test.local`.

Fill in:

- `POSTGRES_URL` with a fresh test database or Neon branch
- your Clerk keys
- `OWNER_EMAILS`

Keep these test-only values in place:

- `APP_URL=http://localhost:3001`
- `NEXT_PUBLIC_APP_URL=http://localhost:3001`
- `NEXT_PUBLIC_APP_NAME=Solarize CRM TEST`
- `NEXT_PUBLIC_APP_ENV_LABEL=TEST`
- `NEXT_PUBLIC_THEME_STORAGE_KEY=solarize-theme-test`

## 2. Bootstrap the test database

Run:

```bash
npm run bootstrap:test-db
```

That script applies the baseline normalized schema migrations and creates a single company row for the test workspace.

It intentionally skips the legacy backfill migration so an empty test database stays clean.

## 3. Start the test app locally

Run:

```bash
npm run dev:test-reset
```

This script:

- loads `.env.test.local`
- stops any local Next server already using this checkout
- clears `.next`
- starts the app on `http://localhost:3001`

Because the same checkout shares the same `.next` folder, do not run the normal dev server and the test dev server at the same time from this repo.

If you want both running side by side, use a second checkout for the test app.

## 4. First login behavior

On first sign-in:

- Clerk still handles authentication
- the app sees a single company in the test database
- your `app_users` row is auto-created inside the test database

That means you do not need to seed users manually just to get into the test workspace.

## Recommended rollout for Permet experiments

1. Start with a fresh test database or a cloned Neon branch.
2. Confirm the app opens as `Solarize CRM TEST`.
3. Add one-way import or sync from Permet into test first.
4. Keep the test app read-only against core job fields until the sync shape feels right.
5. Only after the test flow feels stable should we talk about replacing or freezing the old live CRM fields.

## Best source for existing data

If you want test to feel like the live CRM on day one, the cleanest option is to point `.env.test.local` at a cloned Neon branch of the current database rather than the live production database.

That keeps the structure and records familiar while letting us experiment safely.
