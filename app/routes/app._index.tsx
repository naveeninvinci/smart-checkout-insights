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
  Badge,
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

function getStoreHealthTone(status: string): "success" | "warning" | "critical" {
  switch (status) {
    case "Healthy":
      return "success";
    case "Needs attention":
      return "warning";
    case "At risk":
    default:
      return "critical";
  }
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

  const totalOrders = orders.length;

  const totalRevenue = orders.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const latestOrder = orders[0] ?? null;

  const ordersLast24hList = orders.filter((order) =>
    isWithinLastHours(new Date(order.createdAt), 24),
  );

  const ordersLast7dList = orders.filter((order) =>
    isWithinLastDays(new Date(order.createdAt), 7),
  );

  const ordersLast30dList = orders.filter((order) =>
    isWithinLastDays(new Date(order.createdAt), 30),
  );

  const revenueLast24h = ordersLast24hList.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);

  const revenueLast7d = ordersLast7dList.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);

  const revenueLast30d = ordersLast30dList.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);

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

  const currentAlertCount = alerts.length;

  const storeHealthStatus =
    ordersLast24hList.length === 0
      ? "At risk"
      : structuredAlerts.some((alert) => alert.severity === "critical")
        ? "Needs attention"
        : "Healthy";

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
        `Value: ${previousState.value ? `£${previousState.value}` : "-"} → ${currentState.value ? `£${currentState.value}` : "-"}`,
      );
    }

    if (previousState.currency !== currentState.currency) {
      changes.push(
        `Currency: ${previousState.currency ?? "-"} → ${currentState.currency ?? "-"}`,
      );
    }

    if (previousState.country !== currentState.country) {
      changes.push(
        `Country: ${previousState.country ?? "-"} → ${currentState.country ?? "-"}`,
      );
    }

    if (previousState.device !== currentState.device) {
      changes.push(
        `Device: ${previousState.device ?? "-"} → ${currentState.device ?? "-"}`,
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

    ordersLast24h: ordersLast24hList.length,
    ordersLast7d: ordersLast7dList.length,
    ordersLast30d: ordersLast30dList.length,

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

    currentAlertCount,
    storeHealthStatus,
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
    currentAlertCount,
    storeHealthStatus,
  } = useLoaderData<typeof loader>();

  return (
    <Page title="Smart Checkout Insights">
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Revenue
                  </Text>
                  <Text as="p" variant="heading2xl">
                    £{totalRevenue}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Orders
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {totalOrders}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Checkout-to-Order Rate
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {checkoutConversionRate}%
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Average Order Value
                  </Text>
                  <Text as="p" variant="heading2xl">
                    £{averageOrderValue}
                  </Text>
                </BlockStack>
              </Card>
            </div>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Performance Summary
                </Text>

                <DataTable
                  columnContentTypes={["text", "numeric", "numeric"]}
                  headings={["Period", "Orders", "Revenue"]}
                  rows={[
                    ["Last 24h", <strong>{ordersLast24h}</strong>, <strong>£{revenueLast24h}</strong>],
                    ["Last 7d", <strong>{ordersLast7d}</strong>, <strong>£{revenueLast7d}</strong>],
                    ["Last 30d", <strong>{ordersLast30d}</strong>, <strong>£{revenueLast30d}</strong>],
                  ]}
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Store Health
                </Text>

                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      Status
                    </Text>
                    <Badge tone={getStoreHealthTone(storeHealthStatus)}>
                      {storeHealthStatus}
                    </Badge>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      Last order time
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {latestOrderTime}
                    </Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      Orders in last 24h
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {ordersLast24h}
                    </Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      Active alerts
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {currentAlertCount}
                    </Text>
                  </InlineStack>
                </BlockStack>
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
                  <Card>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Checkout Starts
                      </Text>
                      <Text as="p" variant="headingLg">
                        {totalCheckouts}
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Recent Checkouts
                      </Text>
                      <Text as="p" variant="headingLg">
                        {checkoutsLast30m}
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Recent Orders
                      </Text>
                      <Text as="p" variant="headingLg">
                        {ordersLast30m}
                      </Text>
                    </BlockStack>
                  </Card>
                </div>

                <div style={{ width: "100%", height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelChartData}>
                      <XAxis dataKey="stage" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        <Cell fill="#008060" />
                        <Cell fill="#6D7175" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Revenue Trend
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
                  Smart Alerts
                </Text>

                {alerts.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No alerts right now.
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
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Checkout Activity
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
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Top Performing Products
                </Text>
                <DataTable
                  columnContentTypes={["text", "text", "text"]}
                  headings={["Product", "Quantity Sold", "Revenue"]}
                  rows={topProductsRows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Recent Orders
                </Text>

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