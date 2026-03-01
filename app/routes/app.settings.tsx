import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await authenticate.admin(request);
    return null;
};

export default function SettingsPage() {
    return (
        <Page title="Settings">
            <Card>
                <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                        App settings
                    </Text>
                    <Text as="p" tone="subdued">
                        Placeholder: Configure alert thresholds, emails, date ranges, and segmentation defaults.
                    </Text>
                </BlockStack>
            </Card>
        </Page>
    );
}