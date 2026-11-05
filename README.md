# Legal Flora — Vercel and Supabase

This repository builds the public site into `dist/` and runs its API as one Vercel Node function. Supabase Auth checks the admin email and password. Supabase Postgres stores short-lived admin sessions, login attempts, enquiries, cookie choices, site events and chat settings. The browser never receives a Supabase secret key.

## Set up Supabase

1. Create a Supabase project. In the SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql) once. The SQL creates the application tables, indexes, row security settings, dashboard totals, and an atomic request limiter. Supabase already creates `auth.users`; do not create that table yourself.
2. In **Authentication → Users**, add or invite the admin email and set a password. Confirm the email if your Auth settings require it.
3. The public consultation form collects name, email and phone and writes directly to the `leads` table through the server API. It does not use visitor email sign-in or require SMTP. Set a password for the admin Auth user so staff can access the dashboard.
4. Copy `.env.local.example` to `.env.local` for local Vercel development and fill in **exactly these four variables**:

   | Variable | Where to get it | Purpose |
   | --- | --- | --- |
   | `SUPABASE_URL` | Project URL in Supabase Connect | Auth and REST API base URL |
   | `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` in API Keys | Password sign-in request |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` in API Keys | Server-only database and Auth admin requests |
   | `ADMIN_EMAIL` | The confirmed admin Auth user's email | Restricts dashboard sign-in to that user |

   Set the same four values under **Vercel Project → Settings → Environment Variables** for **Production** (and Preview if you use preview deployments). Choose **Secret** for `SUPABASE_SECRET_KEY`. `SUPABASE_URL` may be the project URL or its `/rest/v1/` URL. Vercel does not receive your uncommitted `.env.local` from GitHub. Never commit `.env.local` or put `SUPABASE_SECRET_KEY` in browser code.

   **If the live consultation form says the server is unavailable:** check these four Vercel variables, then create a **new production deployment** from **Deployments → Redeploy**. Changes to environment variables do not update an existing deployment. The build now reports missing variable names and stops instead of publishing a broken form; it never prints their values.

## Build and deploy

Run `npm ci` and `npm run build` locally. Import the repository into Vercel with its root as the project root. `vercel.json` sets `npm run build`, serves `dist/`, routes `/api/*` to the server function, revalidates HTML, caches fingerprinted assets, and enables clean URLs such as `/funding`. Old `.html` addresses redirect to their clean paths. Vercel uses Node.js 22 for this project.

For a local preview with working API routes, run `npm run dev` after creating `.env.local`, then open `http://127.0.0.1:8766/`. This loopback-only server serves the built pages and forwards `/api/*` to the same handler used by Vercel. A plain static file server can show the layout but cannot send email codes, record cookie choices, or sign in admins.

Run `node tools/check_supabase.js` for a read-only check of table access, the dashboard function, and the admin Auth user. It reads `.env.local` and prints no keys or database rows.

With the local preview running, `node tools/smoke_lead.js` sends one synthetic lead through `/api/lead`, verifies that Supabase stored it, and deletes it. It needs network access. A successful form submission saves a yes/no marker in the visitor's browser so the automatic consultation prompt does not return there; no name, email or phone is stored in that marker.

## Open the admin dashboard

Go to `https://legalflora.com/admin`. Locally, use `http://127.0.0.1:8766/admin` while `npm run dev` is running. Sign in with the admin email set in `ADMIN_EMAIL` and the password you set for that same user in **Supabase → Authentication → Users**. Do not enter the Supabase project secret key as the password. If the admin user has no password yet, set or reset it in Supabase. The admin page can load before the API is configured, but login will not work until the Vercel variables are set and the production site is redeployed.

## API and data notes

- `/api/admin/login` expects the admin **email** and password. The dashboard login field sends the email as `username` for compatibility. Login attempts are recorded in `login_events`.
- The consultation popup sends name, email and phone to `/api/lead`. The API validates the fields, applies an IP-based request limit and ignores the hidden spam field before inserting into `leads`. The admin dashboard reads the same table. Visitor email addresses are unverified.
- The optional analytics banner appears until a visitor accepts or declines. Its choice is stored in `lf_analytics` and logged to `consent_events`. The automatic consultation popup waits for that choice, then appears once per tab; consultation buttons can open it immediately. Visitors can reopen the analytics banner through **Cookie choices** in the footer.
- The admin cookie contains only a random session token. Its hash, expiry and CSRF token are in `admin_sessions`. Sessions last eight hours; logout deletes the server record.
- `lf_analytics` is a first-party browser preference cookie. `/api/consent` stores the yes/no choice and a random tab ID; `/api/track` accepts analytics only after opt-in. Raw cookie headers are not stored.
- `/api/admin/data` returns bounded pages of at most 100 rows per collection. CSV export includes leads, site events, sign-in attempts and cookie choices, capped at 10,000 total rows to keep a single serverless invocation bounded.
- The old SQLite/JSON backend is not part of this Vercel deployment. Existing local records are **not** migrated by this package. Import them separately if you need historical data in Supabase.
- The chatbot uses the built-in FAQ until an admin configures OpenAI or Gemini in the dashboard. External provider calls require valid provider credentials and network access.

Run `npm test` for local API contract tests. The tests mock Supabase; a real project connection can only be checked after the environment values and SQL are supplied.
