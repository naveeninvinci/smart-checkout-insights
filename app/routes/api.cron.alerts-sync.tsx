import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { buildSmartAlerts } from "../services/alerts.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const authHeader = request.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET) {
        return json(
            { ok: false, error: "CRON_SECRET is not configured" },
            { status: 500 },
        );
    }

    if (authHeader !== expected) {
        return json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const shops = await prisma.shop.findMany({
        orderBy: { createdAt: "asc" },
    });

    let totalShopsProcessed = 0;
    let totalAlertsGenerated = 0;
    let totalAlertsCreated = 0;
    let totalAlertsResolved = 0;

    for (const shop of shops) {
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

        const currentAlerts = buildSmartAlerts(orders, checkouts).filter((alert) =>
            enabledCodes.has(alert.code),
        );

        const currentCodes = new Set(currentAlerts.map((alert) => alert.code));

        totalShopsProcessed += 1;
        totalAlertsGenerated += currentAlerts.length;

        const existingActiveAlerts = await prisma.alertEvent.findMany({
            where: {
                shopId: shop.id,
                status: "active",
            },
        });

        for (const existing of existingActiveAlerts) {
            if (!currentCodes.has(existing.code)) {
                await prisma.alertEvent.update({
                    where: { id: existing.id },
                    data: {
                        status: "resolved",
                        resolvedAt: new Date(),
                    },
                });

                totalAlertsResolved += 1;
            }
        }

        for (const alert of currentAlerts) {
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
                            alert.metricValue !== undefined
                                ? String(alert.metricValue)
                                : null,
                        status: "active",
                    },
                });

                totalAlertsCreated += 1;
            }
        }
    }

    return json({
        ok: true,
        shopsProcessed: totalShopsProcessed,
        alertsGenerated: totalAlertsGenerated,
        alertsCreated: totalAlertsCreated,
        alertsResolved: totalAlertsResolved,
        ranAt: new Date().toISOString(),
    });
};