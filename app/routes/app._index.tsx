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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const orders = await prisma.orderEvent.findMany({
    orderBy: { createdAt: "desc" },
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

  const revenueTrendRows = Object.entries(revenueByDayMap)
    .sort((a, b) => {
      const [dayA, monthA, yearA] = a[0].split("/");
      const [dayB, monthB, yearB] = b[0].split("/");

      const dateA = new Date(`${yearA}-${monthA}-${dayA}`);
      const dateB = new Date(`${yearB}-${monthB}-${dayB}`);

      return dateA.getTime() - dateB.getTime();
    })
    .map(([date, revenue]) => [date, `£${revenue.toFixed(2)}`]);

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

  const alerts: string[] = [];

  if (ordersLast24h.length === 0 && totalOrders > 0) {
    alerts.push("⚠ No orders in the last 24 hours.");
  }

  if (revenueLast7d > 0 && revenueLast24h < (revenueLast7d / 7) * 0.5) {
    alerts.push("⚠ Revenue dropped significantly compared to the last 7 days.");
  }

  if (ordersLast24h.length >= 5) {
    alerts.push("🔥 High order activity detected in the last 24 hours.");
  }

  if (topProductsRows.length > 0) {
    alerts.push(`📈 Top product right now: ${topProductsRows[0][0]}`);
  }

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
    revenueTrendRows,
    revenueChartData,
    topProductsRows,
    alerts,
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
  } = useLoaderData<typeof loader>();

  return (
    <Page title="Smart Checkout Insights">
      <BlockStack gap="500">
        <Layout>
          <Layout.Section oneHalf>
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

          <Layout.Section oneHalf>
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

          <Layout.Section oneHalf>
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

          <Layout.Section oneHalf>
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
          <Layout.Section oneThird>
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

          <Layout.Section oneThird>
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

          <Layout.Section oneThird>
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
                    <ResponsiveContainer>
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
                  headings={["Order ID", "Currency", "Total Price", "Created At"]}
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