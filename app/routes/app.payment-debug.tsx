import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import {
    Page,
    Card,
    Text,
    BlockStack,
    TextField,
    Button,
} from "@shopify/polaris";
import { useState } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

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

    const formData = await request.formData();
    const checkoutToken = String(formData.get("checkoutToken") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!checkoutToken) {
        return json(
            { ok: false, error: "Checkout token is required" },
            { status: 400 },
        );
    }

    await prisma.paymentAttemptEvent.create({
        data: {
            shopId: shop.id,
            checkoutToken,
            paymentMethod: "PayPal",
            status: "suspected_failed",
            source: "manual debug entry",
            notes: notes || "PayPal returned user to checkout without completion",
        },
    });

    return json({
        ok: true,
        message: `Recorded suspected PayPal failure for checkout token ${checkoutToken}`,
    });
};

export default function PaymentDebugPage() {
    const actionData = useActionData<typeof action>();
    const [checkoutToken, setCheckoutToken] = useState("");
    const [notes, setNotes] = useState("");

    return (
        <Page title="Payment Debug">
            <Card>
                <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                        Record possible PayPal failure
                    </Text>

                    <Form method="post">
                        <BlockStack gap="300">
                            <TextField
                                label="Checkout token"
                                name="checkoutToken"
                                value={checkoutToken}
                                onChange={setCheckoutToken}
                                autoComplete="off"
                            />

                            <TextField
                                label="Notes"
                                name="notes"
                                value={notes}
                                onChange={setNotes}
                                autoComplete="off"
                            />

                            <Button submit variant="primary">
                                Save suspected PayPal failure
                            </Button>
                        </BlockStack>
                    </Form>

                    {actionData?.ok === true && "message" in actionData && (
                        <Text as="p" tone="success">
                            {actionData.message}
                        </Text>
                    )}

                    {actionData?.ok === false && "error" in actionData && (
                        <Text as="p" tone="critical">
                            {actionData.error}
                        </Text>
                    )}
                </BlockStack>
            </Card>
        </Page>
    );
}