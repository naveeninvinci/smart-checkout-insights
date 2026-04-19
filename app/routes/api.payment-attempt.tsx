import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        const body = await request.json();

        const {
            shopDomain,
            checkoutToken,
            paymentMethod,
            status,
            source,
            notes,
        } = body ?? {};

        if (!shopDomain || !paymentMethod || !status) {
            return json(
                { ok: false, error: "Missing required fields" },
                { status: 400 },
            );
        }

        const shop = await prisma.shop.findUnique({
            where: { shopDomain },
        });

        if (!shop) {
            return json({ ok: false, error: "Shop not found" }, { status: 404 });
        }

        await prisma.paymentAttemptEvent.create({
            data: {
                shopId: shop.id,
                checkoutToken: checkoutToken ?? null,
                paymentMethod,
                status,
                source: source ?? null,
                notes: notes ?? null,
            },
        });

        return json({ ok: true });
    } catch (error) {
        console.error("Failed to save payment attempt event:", error);
        return json({ ok: false, error: "Server error" }, { status: 500 });
    }
};