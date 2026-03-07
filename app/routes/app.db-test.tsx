import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
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
    return (
        <Page title="DB Test" >
            <Card>
                <BlockStack gap="200" >
                    <Text as="h2" variant="headingMd" >
                        Database test route
                    </Text>
                    < Text as="p" tone="subdued" >
                        Open this route to trigger a Prisma write to PostgreSQL.
                    </Text>
                </BlockStack>
            </Card>
        </Page>
    );
}