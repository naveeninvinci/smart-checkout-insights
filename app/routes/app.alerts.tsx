import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
    Page,
    Card,
    Text,
    BlockStack,
    Badge,
    Layout,
    DataTable,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { severityTone } from "../services/alerts.shared";

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

    const alerts = buildSmartAlerts(
        orders,
        checkouts,
        enabledRules,
    ).filter((alert) => enabledCodes.has(alert.code));

    const alertHistory = shop
        ? await prisma.alertEvent.findMany({
            where: { shopId: shop.id },
            orderBy: { createdAt: "desc" },
            take: 20,
        })
        : [];

    const alertHistoryRows = alertHistory.map((alert: any) => [
        alert.title,
        alert.severity,
        alert.status,
        new Date(alert.createdAt).toLocaleString(),
    ]);

    return json({
        alerts,
        alertHistoryRows,
        lastCheckedAt: new Date().toLocaleString(),
    });
};

export default function AlertsPage() {
    const { alerts, alertHistoryRows, lastCheckedAt } =
        useLoaderData<typeof loader>();

    return (
        <Page title="Alerts">
            <BlockStack gap="500">
                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">
                                    Active Smart Alerts
                                </Text>

                                <Text as="p" tone="subdued">
                                    Last checked: {lastCheckedAt}
                                </Text>

                                {alerts.length === 0 ? (
                                    <Text as="p" tone="subdued">
                                        No active alerts right now.
                                    </Text>
                                ) : (
                                    alerts.map((alert) => (
                                        <Card key={alert.id}>
                                            <BlockStack gap="200">
                                                <Text as="h3" variant="headingMd">
                                                    {alert.title}
                                                </Text>

                                                <Badge tone={severityTone(alert.severity)}>
                                                    {alert.severity}
                                                </Badge>

                                                <Text as="p" tone="subdued">
                                                    {alert.description}
                                                </Text>

                                                {alert.metricValue !== undefined && (
                                                    <Text as="p">
                                                        Metric value: {String(alert.metricValue)}
                                                    </Text>
                                                )}
                                            </BlockStack>
                                        </Card>
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
                                    Alert History
                                </Text>

                                {alertHistoryRows.length === 0 ? (
                                    <Text as="p" tone="subdued">
                                        No stored alert history yet.
                                    </Text>
                                ) : (
                                    <DataTable
                                        columnContentTypes={["text", "text", "text", "text"]}
                                        headings={["Title", "Severity", "Status", "Created At"]}
                                        rows={alertHistoryRows}
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