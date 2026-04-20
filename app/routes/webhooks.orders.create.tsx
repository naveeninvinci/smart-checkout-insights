import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { detectRecoveredPaymentSwitch } from "../services/payment-recovery.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const { topic, shop, payload, webhookId, admin } =
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

        console.log(`Saved order ${orderPayload.id} to OrderEvent`);

        try {
            const orderGid = `gid://shopify/Order/${orderPayload.id}`;

            const response = await admin.graphql(
                `#graphql
        query OrderTransactions($id: ID!) {
          order(id: $id) {
            id
            transactions(first: 50) {
              gateway
              formattedGateway
              status
              kind
              createdAt
              errorCode
              manualPaymentGateway
            }
          }
        }`,
                {
                    variables: { id: orderGid },
                },
            );

            const result = await response.json();

            if (result?.errors) {
                console.error(
                    `GraphQL order transaction query errors for order ${orderPayload.id}:`,
                    JSON.stringify(result.errors, null, 2),
                );
            }

            const transactions =
                result?.data?.order?.transactions?.map((tx: any) => ({
                    gateway: tx.formattedGateway ?? tx.gateway ?? null,
                    status: tx.status ?? null,
                    kind: tx.kind ?? null,
                    createdAt: tx.createdAt ?? null,
                    errorCode: tx.errorCode ?? null,
                    manualPaymentGateway: tx.manualPaymentGateway ?? false,
                })) ?? [];

            console.log(
                `Fetched ${transactions.length} transaction(s) for order ${orderPayload.id}:`,
                JSON.stringify(transactions, null, 2),
            );

            const detected = detectRecoveredPaymentSwitch(transactions);

            await prisma.recoveredPaymentSwitch.upsert({
                where: {
                    shopId_orderId: {
                        shopId: shopRecord.id,
                        orderId: String(orderPayload.id),
                    },
                },
                update: {
                    checkoutToken: orderPayload.checkout_token ?? null,
                    failedGateway: detected.failedGateway,
                    failedStatus: detected.failedStatus,
                    failedKind: detected.failedKind,
                    failedAt: detected.failedAt ? new Date(detected.failedAt) : null,
                    failedErrorCode: detected.failedErrorCode,
                    successfulGateway: detected.successfulGateway ?? primaryPaymentMethod,
                    successfulStatus: detected.successfulStatus,
                    successfulKind: detected.successfulKind,
                    successfulAt: detected.successfulAt
                        ? new Date(detected.successfulAt)
                        : new Date(orderPayload.created_at ?? new Date()),
                    switchDetected: detected.switchDetected,
                    notes: detected.notes,
                },
                create: {
                    shopId: shopRecord.id,
                    orderId: String(orderPayload.id),
                    checkoutToken: orderPayload.checkout_token ?? null,
                    failedGateway: detected.failedGateway,
                    failedStatus: detected.failedStatus,
                    failedKind: detected.failedKind,
                    failedAt: detected.failedAt ? new Date(detected.failedAt) : null,
                    failedErrorCode: detected.failedErrorCode,
                    successfulGateway: detected.successfulGateway ?? primaryPaymentMethod,
                    successfulStatus: detected.successfulStatus,
                    successfulKind: detected.successfulKind,
                    successfulAt: detected.successfulAt
                        ? new Date(detected.successfulAt)
                        : new Date(orderPayload.created_at ?? new Date()),
                    switchDetected: detected.switchDetected,
                    notes: detected.notes,
                },
            });

            console.log(
                `Recovered payment switch detected for order ${orderPayload.id}: ${detected.switchDetected}`,
            );
        } catch (transactionError) {
            console.error(
                `Failed to analyze transactions for order ${orderPayload.id}:`,
                transactionError,
            );
        }

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("orders/create webhook failed:", error);
        return new Response("Webhook handler error", { status: 500 });
    }
};