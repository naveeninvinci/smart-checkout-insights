import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    console.log("=== ENABLE PIXEL ROUTE HIT ===");

    try {
        const { admin } = await authenticate.admin(request);

        const response = await admin.graphql(
            `#graphql
      mutation WebPixelCreate($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          userErrors {
            field
            message
            code
          }
          webPixel {
            id
            settings
          }
        }
      }`,
            {
                variables: {
                    webPixel: {
                        settings: {
                            accountID: "smart-checkout-insights",
                        },
                    },
                },
            },
        );

        const result = await response.json();

        console.log("=== WEB PIXEL CREATE RESULT ===");
        console.log(JSON.stringify(result, null, 2));

        const userErrors = result?.data?.webPixelCreate?.userErrors ?? [];

        if (userErrors.length > 0) {
            return json(
                {
                    ok: false,
                    error: "Shopify returned userErrors",
                    userErrors,
                    fullResult: result,
                },
                { status: 400 },
            );
        }

        return json({
            ok: true,
            webPixel: result?.data?.webPixelCreate?.webPixel ?? null,
            fullResult: result,
        });
    } catch (error: any) {
        console.error("=== ENABLE PIXEL FAILED ===");
        console.error(error);

        return json(
            {
                ok: false,
                error: error?.message ?? "Unknown enable pixel error",
                name: error?.name ?? null,
                stack: error?.stack ?? null,
                cause: error?.cause ?? null,
            },
            { status: 500 },
        );
    }
};