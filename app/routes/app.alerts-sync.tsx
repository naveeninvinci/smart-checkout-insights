import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Button } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { buildSmartAlerts } from "../services/alerts.server";

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

    let createdCount = 0;

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
        }
    }

    return json({
        ok: true,
        created: createdCount,
        totalGenerated: alerts.length,
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
                        "totalGenerated" in fetcher.data && (
                            <Text as="p">
                                Alerts synced successfully. New alerts created:{" "}
                                {fetcher.data.created}. Total generated:{" "}
                                {fetcher.data.totalGenerated}.
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