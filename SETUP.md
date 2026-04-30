# TraX — Setup Guide

This guide walks you through standing up the backend and producing a
working mobile build. Three components, in order:

1. **Supabase** — database, RPCs, Edge Functions
2. **Netlify** — public REST API that fronts the Edge Functions
3. **Mobile app** — React Native (bare) Android/iOS build

---

## 1. Supabase backend

### 1.1 Create the project

1. Sign in at <https://app.supabase.com> and create a new project.
2. Keep the project URL and the **service-role key** (Settings →
   API → `service_role`). You'll need both later.

### 1.2 Apply the schema

Open the SQL editor in the Supabase dashboard and run the files in
`supabase/SQL/` **in order**:

1. `0_reset.sql`    — drops everything, only used when starting over
2. `1_schema.sql`   — tables, indexes, extensions
3. `2_policies.sql` — RLS policies (defence in depth)
4. `3_rpc.sql`      — every RPC the Edge Functions call

> The `0_reset.sql` script is destructive. Skip it on a fresh project.

### 1.3 Deploy the Edge Functions

You need the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy auth
supabase functions deploy profile
supabase functions deploy categories
supabase functions deploy accounts
supabase functions deploy transactions
supabase functions deploy budgets
supabase functions deploy savings
supabase functions deploy investments
supabase functions deploy notifications
supabase functions deploy stats
```

Each function is structured the same way:

```
supabase/functions/<domain>/
├── index.ts            # orchestrator only — defines the route table
└── handlers/
    ├── <action>.ts     # one file per action
    └── …
```

`index.ts` is intentionally tiny — it imports the handlers and wires
them into the dispatcher. All business logic lives in
`handlers/<action>.ts`. Shared infrastructure (the Supabase client, the
session validator, the response envelope, the error catalog) lives in
`supabase/functions/_shared/`.

### 1.4 Set Supabase secrets

The Edge Functions automatically receive `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` from the Supabase runtime — there is
nothing extra to configure.

---

## 2. Netlify edge

The Netlify Functions act as a public HTTPS API. They translate the
mobile app's REST calls (`GET /api/transactions`, `DELETE
/api/categories/abc123`, etc.) into the action-style calls the Edge
Functions expect.

### 2.1 Deploy

1. Push this repo to GitHub.
2. Create a Netlify site pointing to the repo, with **base directory**
   `netlify`.
3. Netlify will pick up `netlify/netlify.toml` automatically.

### 2.2 Set Netlify environment variables

In Site settings → Environment variables, add:

| Variable                    | Value                                                |
| --------------------------- | ---------------------------------------------------- |
| `SUPABASE_URL`              | Your Supabase project URL                            |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase **service_role** key                   |
| `ALLOWED_DOMAIN` (optional) | Origin allowed by CORS — defaults to `*` (any origin) |

Redeploy. Once the site is live, hit
`https://<your-site>.netlify.app/api/auth/login` with a `POST` to
confirm the routing works.

---

## 3. Mobile app

### 3.1 Point the app at your API

Open `mobile/src/lib/api.ts` and update the constant near the top:

```ts
const API_BASE_URL = 'https://<your-site>.netlify.app';
```

### 3.2 Install dependencies

```bash
cd mobile
npm install
cd ios && pod install && cd ..   # iOS only
```

### 3.3 Run the app

```bash
# Android
npm run android

# iOS
npm run ios
```

For a release Android build:

```bash
cd android
./gradlew assembleRelease
# APK at android/app/build/outputs/apk/release/app-release.apk
```

---

## Where things live in the mobile app

```
mobile/src/
├── lib/
│   ├── api.ts          # REST client, opaque-token sessions, friendly errors,
│   │                   # offline cache + write queue
│   ├── cache.ts        # AsyncStorage-backed read-through cache
│   ├── queue.ts        # Persistent FIFO queue of offline mutations
│   ├── network.ts      # NetInfo wrapper — drives the auto-sync trigger
│   └── database.ts     # Thin wrappers around api.ts for each domain
├── contexts/           # Auth, app-wide preferences
├── navigation/         # React Navigation stacks/tabs
├── screens/            # Every screen in the app
├── components/         # Reusable UI building blocks
└── types/              # Shared TypeScript types
```

### Offline behaviour at a glance

- **Reads** (every `GET`) go through a read-through cache. The latest
  successful response is persisted to AsyncStorage. When a request fails
  for network reasons, the cached value is returned so the screen keeps
  working.
- **Writes** (every `POST`/`PATCH`/`DELETE`) that fail because the
  device is offline are pushed onto a persistent queue. As soon as
  connectivity returns, the queue drains in order and React Query
  invalidates so the UI refreshes.
- **Sessions** are opaque 32-byte tokens issued by the server, stored in
  the device Keychain (iOS) / Keystore (Android), and rotated within 24
  hours of expiry.
- **User-facing errors** are descriptive and actionable. Internal
  details stay in the server logs.
