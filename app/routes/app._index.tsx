import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  DataTable,
} from "@shopify/polaris";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function isWithinLastHours(date: Date, hours: number) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return diffMs <= hours * 60 * 60 * 1000;
}

function isWithinLastDays(date: Date, days: number) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

function shortCheckoutToken(token: string | null) {
  if (!token || token.trim().length === 0) return "-";
  if (token.length <= 12) return token;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  const { buildSmartAlerts } = await import("../services/alerts.server");

  const orders = shop
    ? await prisma.orderEvent.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
    })
    : [];

  const checkouts = shop
    ? await prisma.checkoutEvent.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
    })
    : [];

  const enabledRules = shop
    ? await prisma.alertRule.findMany({
      where: {
        shopId: shop.id,
        enabled: true,
      },
    })
    : [];

  const enabledCodes = new Set(enabledRules.map((rule) => rule.code));

  const structuredAlerts = buildSmartAlerts(
    orders,
    checkouts,
    enabledRules,
  ).filter((alert) => enabledCodes.has(alert.code));

  const alerts = structuredAlerts.map((alert) => {
    switch (alert.code) {
      case "NO_ORDERS_24H":
        return "⚠ No orders in the last 24 hours.";
      case "REVENUE_DROP_24H":
        return "⚠ Revenue dropped significantly compared to the last 7 days.";
      case "HIGH_ORDER_ACTIVITY_24H":
        return "🔥 High order activity detected in the last 24 hours.";
      case "TOP_PRODUCT_ACTIVE":
        return `📈 ${alert.title}`;
      case "CHECKOUT_CONVERSION_DROP":
        return "🚨 Checkout conversion issue detected. Customers are starting checkout, but no orders were completed recently.";
      default:
        return `ℹ ${alert.title}`;
    }
  });

  const totalOrders = orders.length;

  const totalRevenue = orders.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const latestOrder = orders[0] ?? null;

  const ordersLast24h = orders.filter((order) =>
    isWithinLastHours(new Date(order.createdAt), 24),
  );

  const ordersLast7d = orders.filter((order) =>
    isWithinLastDays(new Date(order.createdAt), 7),
  );

  const ordersLast30d = orders.filter((order) =>
    isWithinLastDays(new Date(order.createdAt), 30),
  );

  const revenueLast24h = ordersLast24h.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);

  const revenueLast7d = ordersLast7d.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);

  const revenueLast30d = ordersLast30d.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);

  const recentOrders = orders.slice(0, 5).map((order) => [
    order.orderId,
    order.currency ?? "-",
    order.totalPrice ? `£${Number(order.totalPrice).toFixed(2)}` : "-",
    new Date(order.createdAt).toLocaleString(),
  ]);

  const revenueByDayMap: Record<string, number> = {};

  for (const order of orders) {
    const day = new Date(order.createdAt).toLocaleDateString("en-GB");
    revenueByDayMap[day] =
      (revenueByDayMap[day] || 0) + Number(order.totalPrice ?? 0);
  }

  const revenueChartData = Object.entries(revenueByDayMap)
    .sort((a, b) => {
      const [dayA, monthA, yearA] = a[0].split("/");
      const [dayB, monthB, yearB] = b[0].split("/");

      const dateA = new Date(`${yearA}-${monthA}-${dayA}`);
      const dateB = new Date(`${yearB}-${monthB}-${dayB}`);

      return dateA.getTime() - dateB.getTime();
    })
    .map(([date, revenue]) => ({
      date,
      revenue: Number(revenue.toFixed(2)),
    }));

  const productMap: Record<
    string,
    { title: string; quantity: number; revenue: number }
  > = {};

  for (const order of orders) {
    const lineItems = Array.isArray(order.lineItems)
      ? (order.lineItems as any[])
      : [];

    for (const item of lineItems) {
      const title = item.title || "Unknown product";
      const quantity = Number(item.quantity ?? 0);
      const price = Number(item.price ?? 0);

      if (!productMap[title]) {
        productMap[title] = {
          title,
          quantity: 0,
          revenue: 0,
        };
      }

      productMap[title].quantity += quantity;
      productMap[title].revenue += quantity * price;
    }
  }

  const topProductsRows = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((product) => [
      product.title,
      product.quantity.toString(),
      `£${product.revenue.toFixed(2)}`,
    ]);

  const now = Date.now();
  const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const recentCheckoutEvents = checkouts.filter(
    (checkout) => new Date(checkout.createdAt) >= thirtyMinutesAgo,
  );

  const checkoutCreateTokens = new Set(
    checkouts
      .filter((checkout) => checkout.eventType === "checkouts/create")
      .map((checkout) => checkout.checkoutToken)
      .filter(
        (token): token is string =>
          typeof token === "string" && token.trim().length > 0,
      ),
  );

  const checkoutUpdateTokens = new Set(
    checkouts
      .filter((checkout) => checkout.eventType === "checkouts/update")
      .map((checkout) => checkout.checkoutToken)
      .filter(
        (token): token is string =>
          typeof token === "string" && token.trim().length > 0,
      ),
  );

  const recentCheckoutTokens = new Set(
    recentCheckoutEvents
      .map((checkout) => checkout.checkoutToken)
      .filter(
        (token): token is string =>
          typeof token === "string" && token.trim().length > 0,
      ),
  );

  const checkoutCreateTokensLast30d = new Set(
    checkouts
      .filter(
        (checkout) =>
          checkout.eventType === "checkouts/create" &&
          new Date(checkout.createdAt) >= thirtyDaysAgo,
      )
      .map((checkout) => checkout.checkoutToken)
      .filter(
        (token): token is string =>
          typeof token === "string" && token.trim().length > 0,
      ),
  );

  const uniqueCheckoutCreates = checkoutCreateTokens.size;
  const uniqueCheckoutUpdates = checkoutUpdateTokens.size;
  const checkoutsLast30m = recentCheckoutTokens.size;

  const ordersLast30m = orders.filter(
    (order) => new Date(order.createdAt) >= thirtyMinutesAgo,
  ).length;

  const matchedOrdersLast30d = orders.filter((order) => {
    if (!order.checkoutToken) return false;
    if (new Date(order.createdAt) < thirtyDaysAgo) return false;
    return checkoutCreateTokensLast30d.has(order.checkoutToken);
  }).length;

  const checkoutConversionRate =
    checkoutCreateTokensLast30d.size > 0
      ? (
        (matchedOrdersLast30d / checkoutCreateTokensLast30d.size) *
        100
      ).toFixed(1)
      : "0.0";

  const checkoutToOrderRateLast30m =
    checkoutsLast30m > 0
      ? ((ordersLast30m / checkoutsLast30m) * 100).toFixed(1)
      : "0.0";

  const funnelChartData = [
    {
      stage: "Checkout Started",
      value: uniqueCheckoutCreates,
    },
    {
      stage: "Checkout Updated",
      value: uniqueCheckoutUpdates,
    },
    {
      stage: "Orders Completed",
      value: totalOrders,
    },
  ];

  const checkoutEventsSortedAsc = [...checkouts].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  type CheckoutChangeRow = {
    checkout: (typeof checkouts)[number];
    changedText: string;
  };

  const meaningfulCheckoutEvents: CheckoutChangeRow[] = [];
  const lastVisibleStateByToken = new Map<
    string,
    {
      value: string | null;
      currency: string | null;
      country: string | null;
      device: string | null;
    }
  >();

  for (const checkout of checkoutEventsSortedAsc) {
    const token =
      typeof checkout.checkoutToken === "string" &&
        checkout.checkoutToken.trim().length > 0
        ? checkout.checkoutToken
        : `no-token-${checkout.id}`;

    const currentState = {
      value:
        checkout.value !== null && checkout.value !== undefined
          ? Number(checkout.value).toFixed(2)
          : null,
      currency: checkout.currency ?? null,
      country: checkout.country ?? null,
      device: checkout.device ?? null,
    };

    const previousState = lastVisibleStateByToken.get(token);

    if (!previousState) {
      meaningfulCheckoutEvents.push({
        checkout,
        changedText: "Initial state",
      });
      lastVisibleStateByToken.set(token, currentState);
      continue;
    }

    const changes: string[] = [];

    if (previousState.value !== currentState.value) {
      changes.push(
        `Value: ${previousState.value ? `£${previousState.value}` : "-"
        } → ${currentState.value ? `£${currentState.value}` : "-"}`,
      );
    }

    if (previousState.currency !== currentState.currency) {
      changes.push(
        `Currency: ${previousState.currency ?? "-"} → ${currentState.currency ?? "-"
        }`,
      );
    }

    if (previousState.country !== currentState.country) {
      changes.push(
        `Country: ${previousState.country ?? "-"} → ${currentState.country ?? "-"
        }`,
      );
    }

    if (previousState.device !== currentState.device) {
      changes.push(
        `Device: ${previousState.device ?? "-"} → ${currentState.device ?? "-"
        }`,
      );
    }

    if (changes.length > 0) {
      meaningfulCheckoutEvents.push({
        checkout,
        changedText: changes.join(" | "),
      });
      lastVisibleStateByToken.set(token, currentState);
    }
  }

  const recentCheckoutRows = meaningfulCheckoutEvents
    .sort(
      (a, b) =>
        new Date(b.checkout.createdAt).getTime() -
        new Date(a.checkout.createdAt).getTime(),
    )
    .slice(0, 8)
    .map(({ checkout, changedText }) => [
      shortCheckoutToken(checkout.checkoutToken),
      checkout.eventType,
      checkout.value ? `£${Number(checkout.value).toFixed(2)}` : "-",
      checkout.currency ?? "-",
      checkout.country ?? "-",
      checkout.device ?? "-",
      changedText,
      new Date(checkout.createdAt).toLocaleString(),
    ]);

  return json({
    totalOrders,
    totalRevenue: totalRevenue.toFixed(2),
    averageOrderValue: averageOrderValue.toFixed(2),
    latestOrderTime: latestOrder
      ? new Date(latestOrder.createdAt).toLocaleString()
      : "No orders yet",

    ordersLast24h: ordersLast24h.length,
    ordersLast7d: ordersLast7d.length,
    ordersLast30d: ordersLast30d.length,

    revenueLast24h: revenueLast24h.toFixed(2),
    revenueLast7d: revenueLast7d.toFixed(2),
    revenueLast30d: revenueLast30d.toFixed(2),

    recentOrders,
    revenueChartData,
    topProductsRows,
    alerts,

    totalCheckouts: uniqueCheckoutCreates,
    checkoutsLast30m,
    ordersLast30m,
    checkoutConversionRate,
    checkoutToOrderRateLast30m,
    funnelChartData,
    recentCheckoutRows,
  });
};

export default function Dashboard() {
  const {
    totalOrders,
    totalRevenue,
    averageOrderValue,
    latestOrderTime,
    ordersLast24h,
    ordersLast7d,
    ordersLast30d,
    revenueLast24h,
    revenueLast7d,
    revenueLast30d,
    recentOrders,
    revenueChartData,
    topProductsRows,
    alerts,
    totalCheckouts,
    checkoutsLast30m,
    ordersLast30m,
    checkoutConversionRate,
    checkoutToOrderRateLast30m,
    funnelChartData,
    recentCheckoutRows,
  } = useLoaderData<typeof loader>();

  return (
    <Page title="Smart Checkout Insights">
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Smart Alerts
                </Text>

                {alerts.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No alerts detected.
                  </Text>
                ) : (
                  alerts.map((alert, index) => (
                    <Text key={index} as="p">
                      {alert}
                    </Text>
                  ))
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Total Orders
                </Text>
                <Text as="p" variant="heading2xl">
                  {totalOrders}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Total Revenue
                </Text>
                <Text as="p" variant="heading2xl">
                  £{totalRevenue}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Average Order Value
                </Text>
                <Text as="p" variant="heading2xl">
                  £{averageOrderValue}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Latest Order Time
                </Text>
                <Text as="p" variant="bodyLg">
                  {latestOrderTime}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Orders in Last 24h
                </Text>
                <Text as="p" variant="heading2xl">
                  {ordersLast24h}
                </Text>
                <Text as="p" tone="subdued">
                  Revenue: £{revenueLast24h}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Orders in Last 7d
                </Text>
                <Text as="p" variant="heading2xl">
                  {ordersLast7d}
                </Text>
                <Text as="p" tone="subdued">
                  Revenue: £{revenueLast7d}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Orders in Last 30d
                </Text>
                <Text as="p" variant="heading2xl">
                  {ordersLast30d}
                </Text>
                <Text as="p" tone="subdued">
                  Revenue: £{revenueLast30d}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Checkout Funnel
                </Text>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      padding: "16px",
                      border: "1px solid #e1e3e5",
                      borderRadius: "12px",
                      background: "#f6f6f7",
                    }}
                  >
                    <Text as="p" variant="bodySm" tone="subdued">
                      Checkout Events
                    </Text>
                    <div style={{ marginTop: "8px" }}>
                      <Text as="p" variant="headingLg">
                        {totalCheckouts}
                      </Text>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "16px",
                      border: "1px solid #e1e3e5",
                      borderRadius: "12px",
                      background: "#f6f6f7",
                    }}
                  >
                    <Text as="p" variant="bodySm" tone="subdued">
                      Recent Checkouts
                    </Text>
                    <div style={{ marginTop: "8px" }}>
                      <Text as="p" variant="headingLg">
                        {checkoutsLast30m}
                      </Text>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "16px",
                      border: "1px solid #e1e3e5",
                      borderRadius: "12px",
                      background: "#f6f6f7",
                    }}
                  >
                    <Text as="p" variant="bodySm" tone="subdued">
                      Recent Orders
                    </Text>
                    <div style={{ marginTop: "8px" }}>
                      <Text as="p" variant="headingLg">
                        {ordersLast30m}
                      </Text>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "16px",
                      border: "1px solid #e1e3e5",
                      borderRadius: "12px",
                      background: "#f6f6f7",
                    }}
                  >
                    <Text as="p" variant="bodySm" tone="subdued">
                      Checkout-to-Order Rate
                    </Text>
                    <div style={{ marginTop: "8px" }}>
                      <Text as="p" variant="headingLg">
                        {checkoutConversionRate}%
                      </Text>
                    </div>
                  </div>
                </div>

                <div style={{ width: "100%", height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelChartData}>
                      <XAxis dataKey="stage" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        <Cell fill="#008060" />
                        <Cell fill="#2C6ECB" />
                        <Cell fill="#6D7175" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <BlockStack gap="100">
                  <Text as="p">
                    Last 30 minutes conversion: {checkoutToOrderRateLast30m}%
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Recent Checkout Activity
                </Text>

                {recentCheckoutRows.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No checkout activity yet.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "Checkout Session",
                      "Event Type",
                      "Value",
                      "Currency",
                      "Country",
                      "Device",
                      "What Changed",
                      "Created At",
                    ]}
                    rows={recentCheckoutRows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Revenue Trend by Day
                </Text>

                {revenueChartData.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No revenue data yet.
                  </Text>
                ) : (
                  <div style={{ width: "100%", height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueChartData}>
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#008060"
                          strokeWidth={3}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Top Products by Revenue
                </Text>
                <DataTable
                  columnContentTypes={["text", "text", "text"]}
                  headings={["Product", "Quantity Sold", "Revenue"]}
                  rows={topProductsRows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Recent Orders
                  </Text>
                </InlineStack>

                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={[
                    "Order ID",
                    "Currency",
                    "Total Price",
                    "Created At",
                  ]}
                  rows={recentOrders}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}