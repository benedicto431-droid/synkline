# Synkline Stores

Synkline Stores is a laptop storefront for guest shopping, product comparisons, and order requests. The user-facing app is Flask with Jinja templates and vanilla HTML, CSS, and JavaScript; do not switch the storefront back to React.

## Run & Operate

- `uv run --project . python app.py` — run the Flask app from the workspace root.
- `uv run --project . gunicorn --bind 0.0.0.0:5001 app:app` — run it with Gunicorn.
- The artifact preview runs the same root `app.py` and serves the storefront and `/api/*` from one Flask service.

## Stack

- Flask, Jinja templates, vanilla JavaScript and CSS
- SQLite at `.data/synkline.sqlite3`
- Product photos in `artifacts/synkline-stores/public/images/`
- Flask-rendered pages and API routes are defined in the root `app.py`

## Where things live

- `app.py` — storefront routes, product and order APIs, Cohere chat, admin sessions, settings, analytics, and image uploads
- `templates/storefront.html` — the shared Flask page shell
- `static/css/storefront.css` — storefront and admin styling
- `static/js/storefront.js` — guest shopping, comparisons, checkout, Cohere chat, admin screens, and anonymous visit reporting
- `artifacts/synkline-stores/public/images/` — bundled laptop images

## Architecture decisions

- Keep the customer storefront public; customers order as guests and do not create accounts.
- Admin username is fixed to `admin`. Read the password only from the `ADMIN_PASSWORD` secret; require at least 12 characters and never hard-code credentials.
- Store analytics as anonymous visitor hashes and page paths. Do not record visitor IP addresses, names, email addresses, or device fingerprints for analytics.
- Guest orders are recorded as unpaid order requests until a payment provider is connected. Do not claim a card was charged.
- Cohere chat must report that it is unavailable when `COHERE_API_KEY` is missing; do not generate fallback answers.
- Uploaded laptop images currently use the app's local uploads directory; use durable storage before relying on uploads across deployments.

## Required secrets

- `SESSION_SECRET` — signs Flask admin sessions.
- `ADMIN_PASSWORD` — enables the admin login when set to a strong password of at least 12 characters.
- `COHERE_API_KEY` — enables product-specific Cohere chat.
