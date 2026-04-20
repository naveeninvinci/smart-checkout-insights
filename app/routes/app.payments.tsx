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
    Badge,
    InlineStack,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { normalizePaymentMethod } from "../services/payments.server";

type PaymentMetric = {
    method: string;
    orders: number;
    revenue: number;
    aov: number;
    ordersLast7d: number;
    ordersPrevious7d: number;
    revenueShare: number;
};

function getPaymentStatus(metric: PaymentMetric) {
    if (metric.ordersLast7d === 0 && metric.ordersPrevious7d > 0) {
        return "Critical";
    }

    if (
        metric.ordersPrevious7d > 0 &&
        metric.ordersLast7d < metric.ordersPrevious7d
    ) {
        return "Needs attention";
    }

    if (metric.ordersLast7d === 0 && metric.orders > 0) {
        return "Needs attention";
    }

    if (metric.ordersLast7d > metric.ordersPrevious7d) {
        return "Strong";
    }

    return "Stable";
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

    const orders = shop
        ? await prisma.orderEvent.findMany({
            where: { shopId: shop.id },
            orderBy: { createdAt: "desc" },
        })
        : [];

    const recoveredPaymentSwitches = shop
        ? await prisma.recoveredPaymentSwitch.findMany({
            where: {
                shopId: shop.id,
                switchDetected: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
        })
        : [];

    const recoveredPaymentRetries = shop
        ? await prisma.recoveredPaymentRetry.findMany({
            where: {
                shopId: shop.id,
                retryRecovered: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
        })
        : [];

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const totalRevenue = orders.reduce((sum, order) => {
        return sum + Number(order.totalPrice ?? 0);
    }, 0);

    const paymentMap: Record<string, PaymentMetric> = {};

    for (const order of orders) {
        const method = normalizePaymentMethod(
            order.primaryPaymentMethod,
            order.paymentGatewayNames,
        );

        if (!paymentMap[method]) {
            paymentMap[method] = {
                method,
                orders: 0,
                revenue: 0,
                aov: 0,
                ordersLast7d: 0,
                ordersPrevious7d: 0,
                revenueShare: 0,
            };
        }

        const amount = Number(order.totalPrice ?? 0);
        const createdAt = new Date(order.createdAt);

        paymentMap[method].orders += 1;
        paymentMap[method].revenue += amount;

        if (createdAt >= sevenDaysAgo) {
            paymentMap[method].ordersLast7d += 1;
        } else if (createdAt >= fourteenDaysAgo && createdAt < sevenDaysAgo) {
            paymentMap[method].ordersPrevious7d += 1;
        }
    }

    const paymentMetrics = Object.values(paymentMap)
        .map((metric) => {
            const aov = metric.orders > 0 ? metric.revenue / metric.orders : 0;
            const revenueShare =
                totalRevenue > 0 ? (metric.revenue / totalRevenue) * 100 : 0;

            return {
                ...metric,
                aov,
                revenueShare,
            };
        })
        .sort((a, b) => b.revenue - a.revenue);

    const paymentRows = paymentMetrics.map((metric) => [
        metric.method,
        String(metric.orders),
        `£${metric.revenue.toFixed(2)}`,
        `£${metric.aov.toFixed(2)}`,
        String(metric.ordersLast7d),
        `${metric.revenueShare.toFixed(1)}%`,
        getPaymentStatus(metric),
    ]);

    const topRevenueMethod = paymentMetrics[0] ?? null;
    const topAovMethod =
        [...paymentMetrics].sort((a, b) => b.aov - a.aov)[0] ?? null;
    const mostUsedMethod =
        [...paymentMetrics].sort((a, b) => b.orders - a.orders)[0] ?? null;

    const paymentAlerts: string[] = [];

    for (const metric of paymentMetrics) {
        if (metric.method === "PayPal" && metric.ordersLast7d === 0 && metric.orders > 0) {
            paymentAlerts.push(
                "⚠ PayPal has historical orders but no completed orders in the last 7 days.",
            );
        }

        if (
            metric.method === "Card" &&
            metric.ordersPrevious7d > 0 &&
            metric.ordersLast7d === 0
        ) {
            paymentAlerts.push(
                "🚨 Card orders dropped to zero in the last 7 days compared with the previous 7 days.",
            );
        }

        if (
            metric.ordersPrevious7d > 0 &&
            metric.ordersLast7d < metric.ordersPrevious7d
        ) {
            paymentAlerts.push(
                `⚠ ${metric.method} orders declined from ${metric.ordersPrevious7d} to ${metric.ordersLast7d} compared to the previous 7-day period.`,
            );
        }
    }

    const recoveredSwitchRows = recoveredPaymentSwitches.map((item) => [
        item.orderId,
        shortCheckoutToken(item.checkoutToken),
        item.failedGateway ?? "-",
        item.successfulGateway,
        item.failedErrorCode ?? "-",
        item.notes ?? "-",
        item.successfulAt ? new Date(item.successfulAt).toLocaleString() : "-",
    ]);

    const recoveredRetryRows = recoveredPaymentRetries.map((item) => [
        item.orderId,
        shortCheckoutToken(item.checkoutToken),
        item.gateway,
        item.failedErrorCode ?? "-",
        item.notes ?? "-",
        item.successfulAt ? new Date(item.successfulAt).toLocaleString() : "-",
    ]);

    let paymentInsight =
        "ℹ Not enough payment data yet to generate a strong payment insight.";
    let paymentInsightTone: "info" | "warning" | "critical" | "success" = "info";

    if (recoveredPaymentSwitches.length > 0 && recoveredPaymentRetries.length > 0) {
        paymentInsight = `⚠ ${recoveredPaymentSwitches.length} recovered switch event(s) and ${recoveredPaymentRetries.length} recovered retry event(s) detected recently. Customers are encountering payment friction, but some recover by switching methods while others retry successfully.`;
        paymentInsightTone = "warning";
    } else if (recoveredPaymentSwitches.length > 0) {
        paymentInsight = `⚠ ${recoveredPaymentSwitches.length} recovered payment switch event(s) detected recently. Customers are failing on one method and completing with another.`;
        paymentInsightTone = "warning";
    } else if (recoveredPaymentRetries.length > 0) {
        paymentInsight = `⚠ ${recoveredPaymentRetries.length} recovered payment retry event(s) detected recently. Customers are failing first, then succeeding on retry with the same method.`;
        paymentInsightTone = "warning";
    } else if (topRevenueMethod && topRevenueMethod.revenueShare >= 70) {
        paymentInsight = `⚠ ${topRevenueMethod.method} is driving ${topRevenueMethod.revenueShare.toFixed(
            1,
        )}% of revenue. Heavy reliance on one payment method may create risk if conversion drops.`;
        paymentInsightTone = "warning";
    } else if (paymentAlerts.length > 0) {
        paymentInsight =
            "⚠ One or more payment methods show signs of weakness. Review the payment comparison table and recent order trends.";
        paymentInsightTone = "warning";
    } else if (topRevenueMethod) {
        paymentInsight = `✅ ${topRevenueMethod.method} is currently the strongest payment method by revenue.`;
        paymentInsightTone = "success";
    }

    return json({
        paymentRows,
        paymentAlerts,
        paymentInsight,
        paymentInsightTone,
        topRevenueMethod: topRevenueMethod
            ? {
                method: topRevenueMethod.method,
                revenue: topRevenueMethod.revenue.toFixed(2),
            }
            : null,
        topAovMethod: topAovMethod
            ? {
                method: topAovMethod.method,
                aov: topAovMethod.aov.toFixed(2),
            }
            : null,
        mostUsedMethod: mostUsedMethod
            ? {
                method: mostUsedMethod.method,
                orders: mostUsedMethod.orders,
            }
            : null,
        recoveredSwitchRows,
        recoveredRetryRows,
    });
};

export default function PaymentsInsightsPage() {
    const {
        paymentRows,
        paymentAlerts,
        paymentInsight,
        paymentInsightTone,
        topRevenueMethod,
        topAovMethod,
        mostUsedMethod,
        recoveredSwitchRows,
        recoveredRetryRows,
    } = useLoaderData<typeof loader>();

    return (
        <Page title="Payment Insights">
            <BlockStack gap="500">
                <Layout>
                    <Layout.Section>
                        <Text as="p" tone="subdued">
                            See which payment methods are helping conversion and which may be
                            causing friction.
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
                                        Top Revenue Method
                                    </Text>
                                    <Text as="p" variant="headingLg">
                                        {topRevenueMethod?.method ?? "-"}
                                    </Text>
                                    <Text as="p" tone="subdued">
                                        {topRevenueMethod ? `£${topRevenueMethod.revenue}` : ""}
                                    </Text>
                                </BlockStack>
                            </Card>

                            <Card>
                                <BlockStack gap="100">
                                    <Text as="p" tone="subdued">
                                        Highest AOV Method
                                    </Text>
                                    <Text as="p" variant="headingLg">
                                        {topAovMethod?.method ?? "-"}
                                    </Text>
                                    <Text as="p" tone="subdued">
                                        {topAovMethod ? `£${topAovMethod.aov}` : ""}
                                    </Text>
                                </BlockStack>
                            </Card>

                            <Card>
                                <BlockStack gap="100">
                                    <Text as="p" tone="subdued">
                                        Most Used Method
                                    </Text>
                                    <Text as="p" variant="headingLg">
                                        {mostUsedMethod?.method ?? "-"}
                                    </Text>
                                    <Text as="p" tone="subdued">
                                        {mostUsedMethod ? `${mostUsedMethod.orders} orders` : ""}
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
                                    Payment Insight
                                </Text>

                                <InlineStack align="space-between">
                                    <Text as="p">{paymentInsight}</Text>
                                    <Badge tone={paymentInsightTone}>
                                        {paymentInsightTone.charAt(0).toUpperCase() +
                                            paymentInsightTone.slice(1)}
                                    </Badge>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">
                                    Payment Method Comparison
                                </Text>

                                {paymentRows.length === 0 ? (
                                    <Text as="p" tone="subdued">
                                        No payment method data available yet.
                                    </Text>
                                ) : (
                                    <DataTable
                                        columnContentTypes={[
                                            "text",
                                            "numeric",
                                            "text",
                                            "text",
                                            "numeric",
                                            "text",
                                            "text",
                                        ]}
                                        headings={[
                                            "Method",
                                            "Orders",
                                            "Revenue",
                                            "AOV",
                                            "Orders Last 7d",
                                            "Revenue Share",
                                            "Status",
                                        ]}
                                        rows={paymentRows}
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
                                    Recovered Payment Switches
                                </Text>

                                {recoveredSwitchRows.length === 0 ? (
                                    <Text as="p" tone="subdued">
                                        No recovered payment switches detected yet.
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
                                        ]}
                                        headings={[
                                            "Order",
                                            "Checkout",
                                            "Failed Gateway",
                                            "Completed With",
                                            "Error Code",
                                            "Notes",
                                            "Completed At",
                                        ]}
                                        rows={recoveredSwitchRows}
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
                                    Recovered Payment Retries
                                </Text>

                                {recoveredRetryRows.length === 0 ? (
                                    <Text as="p" tone="subdued">
                                        No recovered payment retries detected yet.
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
                                        ]}
                                        headings={[
                                            "Order",
                                            "Checkout",
                                            "Gateway",
                                            "Error Code",
                                            "Notes",
                                            "Recovered At",
                                        ]}
                                        rows={recoveredRetryRows}
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
                                    Payment Alerts
                                </Text>

                                {paymentAlerts.length === 0 ? (
                                    <Text as="p" tone="subdued">
                                        No payment-specific alerts right now.
                                    </Text>
                                ) : (
                                    paymentAlerts.map((alert, index) => (
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