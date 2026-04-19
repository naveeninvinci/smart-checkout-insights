import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLocation } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import enTranslations from "@shopify/polaris/locales/en.json";
import { Card, InlineStack, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const navItems = [
  { label: "Dashboard", slug: "" },
  { label: "Checkout", slug: "checkout" },
  { label: "Orders", slug: "orders" },
  { label: "Payments", slug: "payments" },
  { label: "Alerts", slug: "alerts" },
  { label: "Settings", slug: "settings" },
];

function getBaseEmbeddedPath(pathname: string) {
  const knownSlugs = ["checkout", "orders", "payments", "alerts", "settings"];

  for (const slug of knownSlugs) {
    if (pathname.endsWith(`/${slug}`)) {
      return pathname.slice(0, -(`/${slug}`.length));
    }
  }

  return pathname;
}

function isActive(pathname: string, basePath: string, slug: string) {
  const targetPath = slug ? `${basePath}/${slug}` : basePath;
  return pathname === targetPath;
}

export default function AppLayout() {
  const location = useLocation();
  const basePath = getBaseEmbeddedPath(location.pathname);

  return (
    <AppProvider i18n={enTranslations}>
      <div style={{ padding: "16px" }}>
        <Card>
          <InlineStack gap="200" wrap>
            {navItems.map((item) => {
              const active = isActive(location.pathname, basePath, item.slug);

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    const targetPath = item.slug
                      ? `${basePath}/${item.slug}`
                      : basePath;

                    window.location.href = `${targetPath}${location.search}${location.hash}`;
                  }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "12px",
                    background: active ? "#e9e9ea" : "transparent",
                    border: active
                      ? "1px solid #d1d1d1"
                      : "1px solid transparent",
                    cursor: "pointer",
                    fontSize: "16px",
                    fontWeight: active ? 600 : 500,
                    color: "#303030",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </InlineStack>
        </Card>
      </div>

      <Outlet />
    </AppProvider>
  );
}