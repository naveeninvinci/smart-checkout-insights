import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const { topic, shop, payload, webhookId } =
            await authenticate.webhook(request);

        console.log("=== ORDERS/CREATE WEBHOOK RECEIVED ===");
        console.log(`Topic: ${topic}`);
        console.log(`Shop: ${shop}`);
        console.log(`Webhook ID: ${webhookId}`);

        if (!shop) {
            console.error("Missing shop in webhook");
            return new Response("Missing shop", { status: 400 });
        }

        const shopRecord = await prisma.shop.upsert({
            where: { shopDomain: shop },
            update: {},
            create: {
                shopDomain: shop,
                accessToken: "webhook-placeholder-token",
            },
        });

        if (webhookId) {
            await prisma.webhookEvent.upsert({
                where: { webhookId },
                update: {},
                create: {
                    shopId: shopRecord.id,
                    topic,
                    payload: payload as object,
                    webhookId,
                },
            });
        } else {
            await prisma.webhookEvent.create({
                data: {
                    shopId: shopRecord.id,
                    topic,
                    payload: payload as object,
                },
            });
        }

        const orderPayload = payload as any;

        const simplifiedLineItems =
            orderPayload.line_items?.map((item: any) => ({
                productId: item.product_id ?? null,
                variantId: item.variant_id ?? null,
                title: item.title ?? "Unknown product",
                quantity: item.quantity ?? 0,
                price: item.price ?? 0,
                sku: item.sku ?? null,
            })) ?? [];

        const paymentGatewayNames = Array.isArray(orderPayload.payment_gateway_names)
            ? orderPayload.payment_gateway_names
            : [];

        const primaryPaymentMethod =
            paymentGatewayNames.length > 0
                ? String(paymentGatewayNames[0])
                : "Unknown";

        await prisma.orderEvent.upsert({
            where: {
                orderId: String(orderPayload.id),
            },
            update: {
                checkoutToken: orderPayload.checkout_token ?? null,
                currency: orderPayload.currency ?? null,
                totalPrice: orderPayload.total_price
                    ? orderPayload.total_price.toString()
                    : null,
                lineItems: simplifiedLineItems as any,

                paymentGatewayNames: paymentGatewayNames as any,
                primaryPaymentMethod,
                financialStatus: orderPayload.financial_status ?? null,
                sourceName: orderPayload.source_name ?? null,
            },
            create: {
                shopId: shopRecord.id,
                orderId: String(orderPayload.id),
                checkoutToken: orderPayload.checkout_token ?? null,
                currency: orderPayload.currency ?? null,
                totalPrice: orderPayload.total_price
                    ? orderPayload.total_price.toString()
                    : null,
                lineItems: simplifiedLineItems as any,

                paymentGatewayNames: paymentGatewayNames as any,
                primaryPaymentMethod,
                financialStatus: orderPayload.financial_status ?? null,
                sourceName: orderPayload.source_name ?? null,
            },
        });

        await prisma.paymentAttemptEvent.create({
            data: {
                shopId: shopRecord.id,
                checkoutToken: orderPayload.checkout_token ?? null,
                paymentMethod: primaryPaymentMethod,
                status: "completed",
                source: "orders/create webhook",
                notes: `Order ${orderPayload.id} completed`,
            },
        });

        console.log(`Saved order ${orderPayload.id} to OrderEvent`);
        console.log(
            `Payment methods: ${paymentGatewayNames.join(", ") || "Unknown"}`,
        );
        console.log(`Primary payment method: ${primaryPaymentMethod}`);
        console.log(
            `Financial status: ${orderPayload.financial_status ?? "Unknown"}`,
        );

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("orders/create webhook failed:", error);
        return new Response("Webhook handler error", { status: 500 });
    }
};