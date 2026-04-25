import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const body = await request.json();

        const {
            eventName,
            checkoutToken,
            clientId,
            timestamp,
            pageUrl,
        } = body ?? {};

        if (!eventName || !checkoutToken) {
            return json({ ok: false, error: "Missing required fields" }, { status: 400 });
        }

        // Resolve shop from known checkout token later if needed.
        // For now we infer the most recent shop if you're single-store in dev,
        // or you can include shopDomain in the payload if available in your setup.
        const shop = await prisma.shop.findFirst({
            orderBy: { createdAt: "desc" },
        });

        if (!shop) {
            return json({ ok: false, error: "Shop not found" }, { status: 404 });
        }

        const eventTime = timestamp ? new Date(timestamp) : new Date();

        const existing = await prisma.paymentAttemptSession.findUnique({
            where: {
                shopId_checkoutToken: {
                    shopId: shop.id,
                    checkoutToken,
                },
            },
        });

        const baseUpdate: any = {
            lastSeenAt: eventTime,
            clientId: clientId ?? existing?.clientId ?? null,
        };

        if (eventName === "checkout_started") {
            baseUpdate.startedAt = existing?.startedAt ?? eventTime;
            baseUpdate.pageViewCount = (existing?.pageViewCount ?? 0) + 1;
            baseUpdate.status = existing?.status ?? "open";
        }

        if (eventName === "page_viewed") {
            baseUpdate.pageViewCount = (existing?.pageViewCount ?? 0) + 1;
        }

        if (eventName === "payment_info_submitted") {
            baseUpdate.paymentInfoSubmittedCount =
                (existing?.paymentInfoSubmittedCount ?? 0) + 1;
        }

        if (eventName === "alert_displayed") {
            baseUpdate.checkoutAlertCount = (existing?.checkoutAlertCount ?? 0) + 1;
        }

        if (eventName === "checkout_completed") {
            baseUpdate.completedAt = eventTime;
            baseUpdate.recoveredToOrder = true;
            baseUpdate.status = "completed";
        }

        await prisma.paymentAttemptSession.upsert({
            where: {
                shopId_checkoutToken: {
                    shopId: shop.id,
                    checkoutToken,
                },
            },
            update: baseUpdate,
            create: {
                shopId: shop.id,
                checkoutToken,
                clientId: clientId ?? null,
                startedAt: eventName === "checkout_started" ? eventTime : null,
                lastSeenAt: eventTime,
                completedAt: eventName === "checkout_completed" ? eventTime : null,
                paymentInfoSubmittedCount:
                    eventName === "payment_info_submitted" ? 1 : 0,
                checkoutAlertCount:
                    eventName === "alert_displayed" ? 1 : 0,
                pageViewCount:
                    eventName === "page_viewed" || eventName === "checkout_started" ? 1 : 0,
                recoveredToOrder: eventName === "checkout_completed",
                abandonedAfterPaymentAttempt: false,
                status: eventName === "checkout_completed" ? "completed" : "open",
                notes: pageUrl ? `Last page: ${pageUrl}` : null,
            },
        });

        return json({ ok: true });
    } catch (error) {
        console.error("pixel-payment-attempt error:", error);
        return json({ ok: false, error: "Server error" }, { status: 500 });
    }
};