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
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Cell,
} from "recharts";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function shortCheckoutToken(token: string | null) {
    if (!token || token.trim().length === 0) return "-";
    if (token.length <= 12) return token;
    return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

function getDropOffTone(
    percentage: number,
): "success" | "warning" | "critical" {
    if (percentage < 20) return "success";
    if (percentage < 50) return "warning";
    return "critical";
}

function safeDropOffRate(fromCount: number, toCount: number) {
    if (fromCount <= 0) return 0;
    return Number((((fromCount - toCount) / fromCount) * 100).toFixed(1));
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
            value: orders.length,
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

    const engagedCheckoutTokens = new Set(
        meaningfulCheckoutEvents
            .map(({ checkout }) => checkout.checkoutToken)
            .filter(
                (token): token is string =>
                    typeof token === "string" && token.trim().length > 0,
            ),
    );

    const engagedCheckoutCount = engagedCheckoutTokens.size;
    const completedCheckoutCount = matchedOrdersLast30d;

    const startedToEngagedDropOffRate = safeDropOffRate(
        uniqueCheckoutCreates,
        engagedCheckoutCount,
    );

    const engagedToCompletedDropOffRate = safeDropOffRate(
        engagedCheckoutCount,
        completedCheckoutCount,
    );

    const engagementRows = [
        [
            "Checkout started → Checkout engaged",
            String(uniqueCheckoutCreates),
            String(engagedCheckoutCount),
            `${startedToEngagedDropOffRate}%`,
        ],
        [
            "Checkout engaged → Matched order",
            String(engagedCheckoutCount),
            String(completedCheckoutCount),
            `${engagedToCompletedDropOffRate}%`,
        ],
    ];

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

    let aiInsight = "ℹ Not enough data yet to generate insight.";
    let aiInsightType: "info" | "warning" | "critical" | "positive" = "info";

    if (engagedCheckoutCount > 0 && completedCheckoutCount === 0) {
        aiInsight =
            "🚨 All engaged checkout sessions are dropping off before turning into matched orders. This suggests a serious issue after customers interact with checkout.";
        aiInsightType = "critical";
    } else if (engagedToCompletedDropOffRate >= 70) {
        aiInsight = `🔥 ${engagedToCompletedDropOffRate}% of engaged checkout sessions are dropping off before turning into matched orders. Customers are interacting with checkout, but most are not completing payment.`;
        aiInsightType = "critical";
    } else if (engagedToCompletedDropOffRate >= 40) {
        aiInsight = `⚠ ${engagedToCompletedDropOffRate}% drop-off is happening after customers engage with checkout. This may indicate friction near payment or final confirmation.`;
        aiInsightType = "warning";
    } else if (completedCheckoutCount > 0) {
        aiInsight =
            "✅ Checkout engagement is converting into matched orders at a healthy level.";
        aiInsightType = "positive";
    }

    return json({
        totalCheckouts: uniqueCheckoutCreates,
        checkoutsLast30m,
        ordersLast30m,
        checkoutConversionRate,
        checkoutToOrderRateLast30m,
        funnelChartData,
        engagedCheckoutCount,
        completedCheckoutCount,
        startedToEngagedDropOffRate,
        engagedToCompletedDropOffRate,
        engagementRows,
        recentCheckoutRows,
        aiInsight,
        aiInsightType,
    });
};

export default function CheckoutInsightsPage() {
    const {
        totalCheckouts,
        checkoutsLast30m,
        ordersLast30m,
        checkoutConversionRate,
        checkoutToOrderRateLast30m,
        funnelChartData,
        engagedCheckoutCount,
        completedCheckoutCount,
        startedToEngagedDropOffRate,
        engagedToCompletedDropOffRate,
        engagementRows,
        recentCheckoutRows,
        aiInsight,
        aiInsightType,
    } = useLoaderData<typeof loader>();

    return (
        <Page title="Checkout Insights">
            <BlockStack gap="500">
                <Layout>
                    <Layout.Section>
                        <Text as="p" tone="subdued">
                            Understand how customers move through checkout and where progress
                            slows down.
                        </Text>
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
                                                Checkouts in last 30 mins
                                            </Text>
                                            <Text as="p" variant="headingLg">
                                                {checkoutsLast30m}
                                            </Text>
                                        </BlockStack>
                                    </Card>

                                    <Card>
                                        <BlockStack gap="100">
                                            <Text as="p" variant="bodySm" tone="subdued">
                                                Orders in last 30 mins
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

                                <InlineStack align="space-between">
                                    <Text as="p" tone="subdued">
                                        Checkout conversion rate
                                    </Text>
                                    <Text as="p">{checkoutConversionRate}%</Text>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="p" tone="subdued">
                                        Last 30 min conversion
                                    </Text>
                                    <Text as="p">{checkoutToOrderRateLast30m}%</Text>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">
                                    Checkout Engagement Insights
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
                                                Started
                                            </Text>
                                            <Text as="p" variant="headingLg">
                                                {totalCheckouts}
                                            </Text>
                                        </BlockStack>
                                    </Card>

                                    <Card>
                                        <BlockStack gap="100">
                                            <Text as="p" variant="bodySm" tone="subdued">
                                                Engaged
                                            </Text>
                                            <Text as="p" variant="headingLg">
                                                {engagedCheckoutCount}
                                            </Text>
                                        </BlockStack>
                                    </Card>

                                    <Card>
                                        <BlockStack gap="100">
                                            <Text as="p" variant="bodySm" tone="subdued">
                                                Matched Orders
                                            </Text>
                                            <Text as="p" variant="headingLg">
                                                {completedCheckoutCount}
                                            </Text>
                                        </BlockStack>
                                    </Card>
                                </div>

                                <DataTable
                                    columnContentTypes={["text", "numeric", "numeric", "text"]}
                                    headings={["Stage Transition", "From", "To", "Drop-off Rate"]}
                                    rows={engagementRows}
                                />

                                <InlineStack gap="300" align="start">
                                    <Badge tone={getDropOffTone(startedToEngagedDropOffRate)}>
                                        {`Started → Engaged drop-off: ${startedToEngagedDropOffRate}%`}
                                    </Badge>
                                    <Badge tone={getDropOffTone(engagedToCompletedDropOffRate)}>
                                        {`Engaged → Completed drop-off: ${engagedToCompletedDropOffRate}%`}
                                    </Badge>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="p">{aiInsight}</Text>
                                    <Badge tone={getAiInsightTone(aiInsightType)}>
                                        {aiInsightType}
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
            </BlockStack>
        </Page>
    );
}