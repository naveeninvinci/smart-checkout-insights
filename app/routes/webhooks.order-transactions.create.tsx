import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const { topic, shop, webhookId } = await authenticate.webhook(request);

        console.log("=== ORDER_TRANSACTIONS/CREATE WEBHOOK RECEIVED ===");
        console.log(`Topic: ${topic}`);
        console.log(`Shop: ${shop}`);
        console.log(`Webhook ID: ${webhookId}`);

        // You can later use this to re-fetch the order's full transactions
        // and update RecoveredPaymentSwitch again if needed.

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("order_transactions/create webhook failed:", error);
        return new Response("Webhook handler error", { status: 500 });
    }
};