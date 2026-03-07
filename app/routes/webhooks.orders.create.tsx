import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const { topic, shop, payload, webhookId } = await authenticate.webhook(request);

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
                productId: item.product_id,
                variantId: item.variant_id,
                title: item.title,
                quantity: item.quantity,
                price: item.price,
                sku: item.sku,
            })) ?? [];

        await prisma.orderEvent.upsert({
            where: {
                orderId: String(orderPayload.id),
            },
            update: {
                checkoutToken: orderPayload.checkout_token ?? null,
                currency: orderPayload.currency ?? null,
                totalPrice: orderPayload.total_price ? orderPayload.total_price.toString() : null,
                lineItems: simplifiedLineItems as any,
            },
            create: {
                shopId: shopRecord.id,
                orderId: String(orderPayload.id),
                checkoutToken: orderPayload.checkout_token ?? null,
                currency: orderPayload.currency ?? null,
                totalPrice: orderPayload.total_price ? orderPayload.total_price.toString() : null,
                lineItems: simplifiedLineItems as any,
            },
        });

        console.log(`Saved order ${orderPayload.id} to OrderEvent`);

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("orders/create webhook failed:", error);
        return new Response("Webhook handler error", { status: 500 });
    }
};