# Prompt: Set up GA4 for this project

Copy into Cursor chat (fill in the blanks):

---

Set up Google Analytics 4 for this repo using the **ga4-setup** skill.

- GA account name: `google` (or account id: `accounts/___`)
- Property name: `Glenn Earth`
- Site URL: `http://localhost:5173` (or production: `https://___`)

Do this:

1. Ensure gcloud has analytics scope (`application-default login` with `analytics.edit` if needed).
2. Run `GA_ACCOUNT_NAME=google ./scripts/setup-ga4.sh "Glenn Earth" "<site url>"`.
3. Confirm `packages/backoffice-web/.env.local` has `VITE_GA_MEASUREMENT_ID`.
4. Tell me to restart `npm run dev` and check GA4 Realtime.

Do not commit `.env.local`.

---

For a **different** product later, only change property name + URL + account name.
