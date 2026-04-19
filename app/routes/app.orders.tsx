import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
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
    const { session } = await authenticate.admin(request);

    const shop = await prisma.shop.findUnique({
        where: { shopDomain: session.shop },
    });

    const orders = shop
        ? await prisma.orderEvent.findMany({
            where: { shopId: shop.id },
            orderBy: { createdAt: "desc" },
        })
        : [];

    const totalOrders = orders.length;

    const totalRevenue = orders.reduce((sum, order) => {
        return sum + Number(order.totalPrice ?? 0);
    }, 0);

    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

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

    const recentOrders = orders.slice(0, 10).map((order) => [
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
        .slice(0, 10)
        .map((product) => [
            product.title,
            product.quantity.toString(),
            `£${product.revenue.toFixed(2)}`,
        ]);

    return json({
        totalOrders,
        totalRevenue: totalRevenue.toFixed(2),
        averageOrderValue: averageOrderValue.toFixed(2),
        ordersLast24h: ordersLast24hList.length,
        ordersLast7d: ordersLast7dList.length,
        ordersLast30d: ordersLast30dList.length,
        revenueLast24h: revenueLast24h.toFixed(2),
        revenueLast7d: revenueLast7d.toFixed(2),
        revenueLast30d: revenueLast30d.toFixed(2),
        revenueChartData,
        topProductsRows,
        recentOrders,
    });
};

export default function OrdersInsightsPage() {
    const {
        totalOrders,
        totalRevenue,
        averageOrderValue,
        ordersLast24h,
        ordersLast7d,
        ordersLast30d,
        revenueLast24h,
        revenueLast7d,
        revenueLast30d,
        revenueChartData,
        topProductsRows,
        recentOrders,
    } = useLoaderData<typeof loader>();

    return (
        <Page title="Orders Insights">
            <BlockStack gap="500">
                <Layout>
                    <Layout.Section>
                        <Text as="p" tone="subdued">
                            Track revenue, recent orders, and top-performing products.
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
                                    <Text as="p" tone="subdued">
                                        Total Revenue
                                    </Text>
                                    <Text as="p" variant="heading2xl">
                                        £{totalRevenue}
                                    </Text>
                                </BlockStack>
                            </Card>

                            <Card>
                                <BlockStack gap="100">
                                    <Text as="p" tone="subdued">
                                        Total Orders
                                    </Text>
                                    <Text as="p" variant="heading2xl">
                                        {totalOrders}
                                    </Text>
                                </BlockStack>
                            </Card>

                            <Card>
                                <BlockStack gap="100">
                                    <Text as="p" tone="subdued">
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
                                    Revenue Trend
                                </Text>

                                {revenueChartData.length === 0 ? (
                                    <Text as="p" tone="subdued">
                                        No revenue data yet.
                                    </Text>
                                ) : (
                                    <div style={{ width: "100%", height: 320 }}>
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