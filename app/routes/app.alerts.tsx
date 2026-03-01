import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await authenticate.admin(request);
    return null;
};

export default function AlertsPage() {
    return (
        <Page title="Alerts">
            <Card>
                <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                        Alert rules
                    </Text>
                    <Text as="p" tone="subdued">
                        Placeholder: Create rules like “Abandonment &gt; 60% in 24h” and send notifications.
                    </Text>
                </BlockStack>
            </Card>
        </Page>
    );
}