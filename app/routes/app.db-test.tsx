import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Box } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    const shopDomain = session.shop;

    const shop = await prisma.shop.upsert({
        where: { shopDomain },
        update: {},
        create: {
            shopDomain,
            accessToken: session.accessToken ?? "missing-token",
        },
    });

    const webhookEvent = await prisma.webhookEvent.create({
        data: {
            shopId: shop.id,
            topic: "db-test",
            payload: {
                message: "Database connection successful",
                createdAt: new Date().toISOString(),
            },
        },
    });

    return json({
        success: true,
        shop,
        webhookEvent,
    });
};

export default function DbTestPage() {
    const data = useLoaderData<typeof loader>();

    return (
        <Page title="DB Test">
            <Card>
                <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                        Database test route
                    </Text>

                    <Text as="p" tone="subdued">
                        This route writes one Shop record and one WebhookEvent record.
                    </Text>

                    <Text as="h3" variant="headingMd">
                        Shop
                    </Text>
                    <Box
                        padding="400"
                        background="bg-surface-active"
                        borderWidth="025"
                        borderRadius="200"
                        borderColor="border"
                    >
                        <pre style={{ margin: 0 }}>
                            <code>{JSON.stringify(data.shop, null, 2)}</code>
                        </pre>
                    </Box>

                    <Text as="h3" variant="headingMd">
                        Webhook Event
                    </Text>
                    <Box
                        padding="400"
                        background="bg-surface-active"
                        borderWidth="025"
                        borderRadius="200"
                        borderColor="border"
                    >
                        <pre style={{ margin: 0 }}>
                            <code>{JSON.stringify(data.webhookEvent, null, 2)}</code>
                        </pre>
                    </Box>
                </BlockStack>
            </Card>
        </Page>
    );
}