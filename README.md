# Smart Checkout Insights (Shopify Embedded App)

An embedded Shopify analytics app that ingests checkout + order events via webhooks,
stores them in PostgreSQL, and visualizes funnel conversion, abandonment trends,
segmentation filters, and alerts.

## Tech Stack
- Remix + Shopify App Remix
- Shopify Admin GraphQL API
- Shopify Webhooks
- PostgreSQL + Prisma (Day 2)
- Render deploy (Day 15)
- Playwright E2E tests (Day 14)

## Planned Features
- Funnel: Started → Updated → Completed
- Trends: Abandonment rate over time
- Segmentation: Country, device, channel (best-effort)
- Alerts: abandonment threshold rules + email notifications
- Insights: rule-based + optional AI summary

## Screenshots
- Dashboard (coming)
- Alerts (coming)
- Segmentation filters (coming)

## Local Dev
```bash
shopify app dev


**Done when:**
- README looks like a real project already.

---

# Quick decisions for tomorrow (Day 2)
Tomorrow we set up **PostgreSQL + Prisma**.

You’ll need:
- A local Postgres running (Docker is easiest)

## Easiest local Postgres (Docker)
If you have Docker:
```bash
docker run --name sci-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sci -p 5432:5432 -d postgres:16