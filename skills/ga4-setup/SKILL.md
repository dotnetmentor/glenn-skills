---
name: ga4-setup
description: >-
  Set up Google Analytics 4 for a Glenn-style project: create property + web stream
  via CLI (Analytics Admin API), write VITE_GA_MEASUREMENT_ID, wire minimal gtag
  in backoffice-web. Use when the user asks to set up GA, GA4, Google Analytics,
  measurement ID, or run setup-ga4 for a new product under a GA account.
---

# GA4 setup (account → property → app)

## When the user invokes this

They want end-to-end GA4 for one product, usually under an existing GA **account** (e.g. `google`).

**Account** = org bucket in analytics.google.com picker.  
**Property** = one product (e.g. Glenn Earth).  
**Data stream** = website; outputs `G-XXXXXXXX`.

## One-time auth (per machine)

If API returns `ACCESS_TOKEN_SCOPE_INSUFFICIENT`:

```bash
gcloud auth application-default login \
  --scopes="https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform"
gcloud services enable analyticsadmin.googleapis.com
```

## Run setup (preferred)

From repo root:

```bash
chmod +x scripts/setup-ga4.sh
GA_ACCOUNT_NAME=google ./scripts/setup-ga4.sh "Glenn Earth" "http://localhost:5173"
```

Or with explicit account id:

```bash
GA_ACCOUNT=accounts/XXXXXXXX ./scripts/setup-ga4.sh "Glenn Earth" "https://production-url.com"
```

Script writes `packages/backoffice-web/.env.local` with `VITE_GA_MEASUREMENT_ID`.

## App wiring (already in template)

- `packages/backoffice-web/src/lib/analytics.ts` — load gtag when ID set; skip `/embed`
- `packages/backoffice-web/src/lib/GaPageViewTracker.tsx` — SPA page_view on route change
- `main.tsx` mounts tracker inside `BrowserRouter`

## Verify

1. Restart `npm run dev` in `packages/backoffice-web` (env is read at start).
2. Open app (not `/embed`).
3. GA4 console → account `google` → property **Glenn Earth** → **Reports → Realtime**.

## New GA account (rare)

Only if user needs a **5th top-level account**, not a new property:

```bash
TOKEN=$(gcloud auth application-default print-access-token)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"account":{"displayName":"NAME","regionCode":"SE"}}' \
  "https://analyticsadmin.googleapis.com/v1beta/accounts:provisionAccountTicket" \
  | jq -r '"https://analytics.google.com/analytics/web/?provisioningSignup=false#/termsofservice/" + .accountTicketId'
```

User must open URL and accept TOS once.

## Agent checklist

1. Confirm GA account name or `accounts/...` id.
2. Confirm property display name and production URL (default dev: `http://localhost:5173`).
3. Run `scripts/setup-ga4.sh`.
4. If scope error → give user the auth command above.
5. Confirm `.env.local` has `VITE_GA_MEASUREMENT_ID`.
6. Remind restart dev server + Realtime check.

Do **not** commit `.env.local`.
