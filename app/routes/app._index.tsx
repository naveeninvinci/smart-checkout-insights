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

function getStoreHealthTone(
  status: string,
): "success" | "warning" | "critical" {
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

function getAiInsightTone(
  insightType: string,
): "success" | "info" | "warning" | "critical" {
  switch (insightType) {
    case "positive":
      return "success";
    case "warning":
      return "warning";
    case "critical":
      return "critical";
    case "info":
    default:
      return "info";
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

  const now = Date.now();
  const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const recentCheckoutEvents = checkouts.filter(
    (checkout) => new Date(checkout.createdAt) >= thirtyMinutesAgo,
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

  const ordersLast30m = orders.filter(
    (order) => new Date(order.createdAt) >= thirtyMinutesAgo,
  ).length;

  const checkoutToOrderRateLast30m =
    recentCheckoutTokens.size > 0
      ? ((ordersLast30m / recentCheckoutTokens.size) * 100).toFixed(1)
      : "0.0";

  const currentAlertCount = alerts.length;

  const storeHealthStatus =
    ordersLast24hList.length === 0
      ? "At risk"
      : structuredAlerts.some((alert) => alert.severity === "critical")
        ? "Needs attention"
        : "Healthy";

  const hasRecentOrders = ordersLast24hList.length > 0;
  const hasCriticalAlert = structuredAlerts.some(
    (alert) => alert.severity === "critical",
  );

  let aiInsight = "ℹ Not enough data yet to generate insight.";
  let aiInsightType: "info" | "warning" | "critical" | "positive" = "info";

  if (!hasRecentOrders && currentAlertCount > 0) {
    aiInsight =
      "⚠ The store has no recent orders and active alerts are present. It may be worth reviewing checkout behaviour, traffic quality, and payment flow.";
    aiInsightType = "warning";
  } else if (Number(checkoutConversionRate) < 20) {
    aiInsight = `🔥 Checkout conversion is ${checkoutConversionRate}% over the last 30 days, which suggests many checkout sessions are not turning into completed orders.`;
    aiInsightType = "critical";
  } else if (hasRecentOrders && !hasCriticalAlert) {
    aiInsight =
      "✅ Checkout flow looks healthy right now. The store has recent orders and no critical conversion issues detected.";
    aiInsightType = "positive";
  }

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
    checkoutConversionRate,
    checkoutToOrderRateLast30m,
    currentAlertCount,
    storeHealthStatus,
    alerts,
    aiInsight,
    aiInsightType,
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
    checkoutConversionRate,
    checkoutToOrderRateLast30m,
    currentAlertCount,
    storeHealthStatus,
    alerts,
    aiInsight,
    aiInsightType,
  } = useLoaderData<typeof loader>();

  return (
    <Page title="Smart Checkout Insights">
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Text as="p" tone="subdued">
              Monitor store health, conversion, and active issues at a glance.
            </Text>
          </Layout.Section>
        </Layout>

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
                    Checkout Conversion Rate
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
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  AI Insight
                </Text>
                <InlineStack align="space-between">
                  <Text as="p">{aiInsight}</Text>
                  <Badge tone={getAiInsightTone(aiInsightType)}>
                    {aiInsightType.charAt(0).toUpperCase() + aiInsightType.slice(1)}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>
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
                    ["Last 24h", ordersLast24h, `£${revenueLast24h}`],
                    ["Last 7d", ordersLast7d, `£${revenueLast7d}`],
                    ["Last 30d", ordersLast30d, `£${revenueLast30d}`],
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
                    <Text as="p">{latestOrderTime}</Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      Orders in last 24h
                    </Text>
                    <Text as="p">{ordersLast24h}</Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      Active alerts
                    </Text>
                    <Text as="p">{currentAlertCount}</Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      Last 30 min conversion
                    </Text>
                    <Text as="p">{checkoutToOrderRateLast30m}%</Text>
                  </InlineStack>
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
      </BlockStack>
    </Page>
  );
}