import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import {
    Page,
    Card,
    Text,
    BlockStack,
    Checkbox,
    Button,
    InlineStack,
    Layout,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const DEFAULT_RULES = [
    {
        code: "NO_ORDERS_24H",
        label: "No orders in the last 24 hours",
        description:
            "Warn when the store has not received any orders in the past 24 hours.",
    },
    {
        code: "REVENUE_DROP_24H",
        label: "Revenue dropped compared to recent performance",
        description:
            "Warn when the last 24 hours revenue is much lower than the recent 7-day trend.",
    },
    {
        code: "HIGH_ORDER_ACTIVITY_24H",
        label: "High order activity detected",
        description:
            "Show a positive alert when unusually strong order activity is detected.",
    },
    {
        code: "TOP_PRODUCT_ACTIVE",
        label: "Top product active insight",
        description:
            "Show an informational alert for the top-performing product.",
    },
    {
        code: "CHECKOUT_CONVERSION_DROP",
        label: "Checkout conversion issue detected",
        description:
            "Warn when many customers start checkout but no orders are completed recently.",
    },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    const shop = await prisma.shop.findUnique({
        where: { shopDomain: session.shop },
    });

    if (!shop) {
        throw new Response("Shop not found", { status: 404 });
    }

    for (const rule of DEFAULT_RULES) {
        await prisma.alertRule.upsert({
            where: {
                shopId_code: {
                    shopId: shop.id,
                    code: rule.code,
                },
            },
            update: {},
            create: {
                shopId: shop.id,
                code: rule.code,
                enabled: true,
            },
        });
    }

    const rules = await prisma.alertRule.findMany({
        where: { shopId: shop.id },
        orderBy: { code: "asc" },
    });

    const rulesForUi = DEFAULT_RULES.map((defaultRule) => {
        const savedRule = rules.find((rule) => rule.code === defaultRule.code);

        return {
            code: defaultRule.code,
            label: defaultRule.label,
            description: defaultRule.description,
            enabled: savedRule?.enabled ?? true,
        };
    });

    return json({ rules: rulesForUi });
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

    for (const rule of DEFAULT_RULES) {
        const enabled = formData.get(rule.code) === "on";

        await prisma.alertRule.upsert({
            where: {
                shopId_code: {
                    shopId: shop.id,
                    code: rule.code,
                },
            },
            update: {
                enabled,
            },
            create: {
                shopId: shop.id,
                code: rule.code,
                enabled,
            },
        });
    }

    return json({
        ok: true,
        message: "Alert settings saved successfully.",
    });
};

export default function SettingsPage() {
    const { rules } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();

    const initialState = useMemo(() => {
        return Object.fromEntries(rules.map((rule) => [rule.code, rule.enabled]));
    }, [rules]);

    const [ruleState, setRuleState] = useState<Record<string, boolean>>(initialState);

    return (
        <Page title="Settings">
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg">
                                Alert Settings
                            </Text>

                            <Text as="p" tone="subdued">
                                Control which smart alerts are enabled for this store.
                            </Text>

                            <Form method="post">
                                <BlockStack gap="400">
                                    {rules.map((rule) => (
                                        <Card key={rule.code}>
                                            <BlockStack gap="200">
                                                <Checkbox
                                                    label={rule.label}
                                                    checked={ruleState[rule.code] ?? false}
                                                    onChange={(checked) => {
                                                        setRuleState((prev) => ({
                                                            ...prev,
                                                            [rule.code]: checked,
                                                        }));
                                                    }}
                                                />

                                                {ruleState[rule.code] && (
                                                    <input type="hidden" name={rule.code} value="on" />
                                                )}

                                                <Text as="p" tone="subdued">
                                                    {rule.description}
                                                </Text>
                                            </BlockStack>
                                        </Card>
                                    ))}

                                    <InlineStack gap="300">
                                        <Button submit variant="primary">
                                            Save settings
                                        </Button>
                                    </InlineStack>

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
                            </Form>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}