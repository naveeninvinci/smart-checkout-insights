import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Button } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { buildSmartAlerts } from "../services/alerts.server";
import { sendAlertSummaryEmail } from "../services/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await authenticate.admin(request);
    return json({ ok: true });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    const shop = await prisma.shop.findUnique({
        where: { shopDomain: session.shop },
    });

    if (!shop) {
        return json({ ok: false, error: "Shop not found" }, { status: 404 });
    }

    const orders = await prisma.orderEvent.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
    });

    const checkouts = await prisma.checkoutEvent.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
    });

    const enabledRules = await prisma.alertRule.findMany({
        where: {
            shopId: shop.id,
            enabled: true,
        },
    });

    const enabledCodes = new Set(enabledRules.map((rule) => rule.code));

    const alerts = buildSmartAlerts(
        orders,
        checkouts,
        enabledRules,
    ).filter((alert) => enabledCodes.has(alert.code));

    const currentCodes = new Set(alerts.map((alert) => alert.code));

    const existingActiveAlerts = await prisma.alertEvent.findMany({
        where: {
            shopId: shop.id,
            status: "active",
        },
    });

    let resolvedCount = 0;
    let createdCount = 0;
    let emailsSent = 0;

    for (const existing of existingActiveAlerts) {
        if (!currentCodes.has(existing.code)) {
            await prisma.alertEvent.update({
                where: { id: existing.id },
                data: {
                    status: "resolved",
                    resolvedAt: new Date(),
                },
            });

            resolvedCount += 1;
        }
    }

    const newlyCreatedAlerts: Array<{
        title: string;
        severity: string;
        description: string;
        metricValue?: string | number | null;
    }> = [];

    for (const alert of alerts) {
        const existing = await prisma.alertEvent.findFirst({
            where: {
                shopId: shop.id,
                code: alert.code,
                status: "active",
            },
        });

        if (!existing) {
            await prisma.alertEvent.create({
                data: {
                    shopId: shop.id,
                    code: alert.code,
                    title: alert.title,
                    severity: alert.severity,
                    description: alert.description,
                    metricValue:
                        alert.metricValue !== undefined ? String(alert.metricValue) : null,
                    status: "active",
                },
            });

            createdCount += 1;

            newlyCreatedAlerts.push({
                title: alert.title,
                severity: alert.severity,
                description: alert.description,
                metricValue:
                    alert.metricValue !== undefined ? alert.metricValue : null,
            });
        }
    }

    if (
        shop.alertEmailsEnabled &&
        shop.alertEmail &&
        newlyCreatedAlerts.length > 0
    ) {
        try {
            await sendAlertSummaryEmail({
                to: shop.alertEmail,
                shopDomain: shop.shopDomain,
                alerts: newlyCreatedAlerts,
            });
            emailsSent += 1;
        } catch (error) {
            console.error("Failed to send alert summary email:", error);
        }
    }

    return json({
        ok: true,
        created: createdCount,
        resolved: resolvedCount,
        totalGenerated: alerts.length,
        emailsSent,
    });
};

export default function AlertsSyncPage() {
    const fetcher = useFetcher<typeof action>();
    const isLoading =
        ["loading", "submitting"].includes(fetcher.state) &&
        fetcher.formMethod === "POST";

    return (
        <Page title="Sync Alerts">
            <Card>
                <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                        Generate and store active alerts
                    </Text>

                    <fetcher.Form method="post">
                        <Button submit loading={isLoading}>
                            Sync alerts now
                        </Button>
                    </fetcher.Form>

                    {fetcher.data?.ok === true &&
                        "created" in fetcher.data &&
                        "resolved" in fetcher.data &&
                        "totalGenerated" in fetcher.data &&
                        "emailsSent" in fetcher.data && (
                            <Text as="p">
                                Alerts synced successfully. New alerts created:{" "}
                                {fetcher.data.created}. Alerts resolved:{" "}
                                {fetcher.data.resolved}. Total generated:{" "}
                                {fetcher.data.totalGenerated}. Summary emails sent:{" "}
                                {fetcher.data.emailsSent}.
                            </Text>
                        )}

                    {fetcher.data?.ok === false && "error" in fetcher.data && (
                        <Text as="p" tone="critical">
                            {fetcher.data.error}
                        </Text>
                    )}
                </BlockStack>
            </Card>
        </Page>
    );
}