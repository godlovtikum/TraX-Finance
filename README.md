# TraX — Personal Finance for Cameroon

TraX is a mobile app that helps people in Cameroon (and anywhere else
that uses XAF) track every franc they earn, spend, save, and invest —
even when the network is unreliable.
Designed with an **Offline-first approach**, the system ensure smooth 
functioning even without internet, and every change is automatically
synced once you're back online.

## What you can do with TraX

- **Track income and expenses** with categories, accounts (cash, bank,
  mobile money), receipts, and recurring entries.
- **Set monthly budgets** per category and watch your real-time spending
  bar fill up.
- **Save toward goals** — name the goal, set a target and a deadline,
  and TraX shows you how far you've come.
- **Log investments** (stocks, crypto, retirement, real estate, bonds)
  alongside your day-to-day money.
- **See your trends** with monthly income/expense charts and a
  breakdown of where your money goes.
- **Get notified** on your schedule (daily, weekly, monthly, or any
  custom cadence) so you never forget to check in.
- **Stay in control offline** — TraX caches your data locally and
  queues every change, then quietly syncs the moment you have a
  signal again.

##  Preview 
# 🔗 [https://trax-finance.netlify.app](https://trax-finance.netlify.app)
## Mobile app
# [https://trax-finance.netlify.app/api/download/android](https://trax-finance.netlify.app/api/download/android)

## What's in this repository

| Folder        | Purpose                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `mobile/`     | React Native (bare CLI, Android + iOS) app. This is what users install.          |
| `netlify/`    | Netlify Functions that translate the mobile app's REST calls into action calls.  |
| `supabase/`   | Postgres schema, RPCs, and Supabase Edge Functions where the business logic lives. |
| `SETUP.md`    | Step-by-step guide to building the mobile app and provisioning the backend.       |

## Tech stack at a glance

- **Mobile:** React Native 0.81 (bare CLI), TypeScript, React Query,
  React Navigation, Notifee, Keychain (secure session storage),
  AsyncStorage (offline cache + write queue), NetInfo (connectivity).
- **Backend:** Supabase Edge Functions (Deno + `@supabase/supabase-js`),
  Postgres with RPCs, opaque session tokens (no JWTs), bcrypt for
  password hashing.
- **Edge:** Netlify Functions act as the public API surface — they
  translate REST verbs and paths into the action-style calls the Edge
  Functions expect, and forward the user's bearer token.

## Getting started

See **[SETUP.md](./SETUP.md)** for the full walkthrough — Supabase
project, Netlify deployment, and a debug Android build you can install
on your phone.
