Smart Checkout Insights (Shopify Embedded App)

Smart Checkout Insights is a Shopify analytics application that provides real-time visibility into checkout activity, conversion performance, and revenue trends.

The goal of this project is to help merchants understand how customers move through the checkout funnel, detect potential issues, and monitor store performance through an interactive dashboard.

This project was built as a full-stack Shopify embedded app using modern technologies including Remix, Prisma, and Shopify Polaris.

⸻

Tech Stack

Frontend
	•	Remix
	•	Shopify Polaris
	•	Recharts

Backend
	•	Node.js
	•	Prisma ORM
	•	Shopify Admin API
	•	Shopify Webhooks

Database
	•	SQLite (development)
	•	PostgreSQL compatible (production)

Other Tools
	•	TypeScript
	•	Shopify App Bridge
	•	Shopify Partner development store

⸻

Shopify Store
     │
     │ Webhooks
     ▼
Smart Checkout Insights App
(Remix + Node.js)
     │
     │ Stores events
     ▼
Database
(Prisma ORM)
     │
     │ Aggregates analytics
     ▼
Analytics Engine
     │
     ├─ Checkout Funnel
     ├─ Conversion Metrics
     ├─ Revenue Trends
     └─ Smart Alerts
     │
     ▼
Dashboard UI
(Polaris + Recharts)

Shopify Webhooks → Node API → Prisma → Database → Dashboard

How the system works

1️⃣ Shopify sends webhook events

The app subscribes to Shopify webhook topics:
checkouts/create
checkouts/update
orders/create

Whenever a customer interacts with checkout, Shopify sends events to the app.


2️⃣ Events are stored in the database

Webhook payloads are processed and stored using Prisma ORM.

Tables include:
checkoutEvent
orderEvent
alertRule
shop

3️⃣ Analytics engine processes events

The backend aggregates events to compute:
	•	checkout sessions
	•	conversion rate
	•	funnel stages
	•	revenue trends
	•	checkout behaviour changes

⸻

4️⃣ Dashboard visualises the analytics

The frontend dashboard displays:
	•	KPI cards
	•	funnel chart
	•	revenue trend charts
	•	checkout activity log
	•	alerts panel

Built using:
	•	Shopify Polaris
	•	Recharts
	•	Remix loaders

---------------------------------------------------------------------------------------

Features

Checkout Funnel Analytics

Visualise the journey from checkout start to completed orders.

Stages include:
	•	Checkout started
	•	Checkout updated
	•	Orders completed
	•	Real-time funnel chart

⸻

Conversion Rate Tracking

Track checkout performance with calculated metrics.

Metrics include:
	•	Checkout-to-order conversion rate
	•	Last 30-minute conversion
	•	Total checkout sessions
	•	Recent checkout activity

⸻

Checkout Activity Log

A structured event log that highlights meaningful checkout changes, not just raw webhook events.

Each activity entry shows:
	•	Checkout session
	•	Event type
	•	Value
	•	Currency
	•	Country
	•	Device
	•	What changed
	•	Timestamp

Revenue Analytics

Track store performance over time.

Metrics include:
	•	Revenue by day chart
	•	Orders last 24 hours
	•	Orders last 7 days
	•	Orders last 30 days
	•	Average order value

⸻

Product Insights

Identify the most valuable products.

Top products table includes:
	•	Product name
	•	Quantity sold
	•	Revenue generated

⸻

Smart Alerts

Automatic alerts detect unusual store activity.

Examples include:
	•	No orders in the last 24 hours
	•	Revenue drop compared to historical averages
	•	High order activity spikes
	•	Checkout conversion issues

Alerts are configurable through alert rules stored in the database.

⸻

How It Works

Data Sources

The app listens to Shopify webhook events including:
	•	checkouts/create
	•	checkouts/update
	•	orders/create

These events are stored in the database and used to generate analytics.

⸻

Checkout Session Tracking

Each checkout event contains a checkoutToken which identifies a checkout session.

The app:
	1.	Groups events by checkout token
	2.	Tracks meaningful field changes
	3.	Generates a readable checkout activity log

This prevents noisy webhook spam and highlights only real checkout changes.

⸻

Example Dashboard Sections

The dashboard includes:
	•	Store KPIs
	•	Revenue trend charts
	•	Checkout funnel chart
	•	Smart alerts
	•	Recent checkout activity
	•	Top performing products
	•	Recent orders

⸻

Planned Features

Planned improvements include:
	•	Funnel analysis (Started → Updated → Completed)
	•	Checkout abandonment trends
	•	Customer segmentation (country, device, channel)
	•	Alert rules with email notifications
	•	AI-generated store insights

⸻

Screenshots

Screenshots will be added as the project evolves.

Planned screenshots:
	•	Dashboard overview
	•	Checkout activity log
	•	Funnel analytics
	•	Alerts panel

Example structure:
screenshots/
  dashboard.png
  checkout-activity.png
  funnel-chart.png


  Local Development

1. Clone the repository
git clone https://github.com/YOUR_USERNAME/smart-checkout-insights.git
cd smart-checkout-insights

2. Install dependencies
npm install

3. Start the Shopify development server
shopify app dev

This will:
	•	start the Remix development server
	•	create a tunnel for Shopify webhooks
	•	install the app on your development store

    
Optional: Run PostgreSQL locally

For production-like development you can run PostgreSQL using Docker.
docker run \
  --name sci-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sci \
  -p 5432:5432 \
  -d postgres:16

  Then update your .env database connection string.

  Testing the App

To simulate checkout events:
	1.	Open your Shopify development store
	2.	Add products to cart
	3.	Start checkout
	4.	Update cart quantities
	5.	Complete the order

The dashboard will update automatically with webhook data.

⸻

Project Goals

This project demonstrates:
	•	Shopify app development
	•	webhook event processing
	•	analytics dashboard design
	•	real-time store monitoring
	•	data visualisation for e-commerce
	•	full-stack JavaScript architecture

⸻

Author

Naveen
QA Automation Engineer | Software Tester | Full-stack Learning

⸻

License

This project is for educational and portfolio purposes.