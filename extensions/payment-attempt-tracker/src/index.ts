import { register } from "@shopify/web-pixels-extension";

register(({ analytics, browser }) => {
  async function sendEvent(eventName: string, event: any) {
    try {
      const checkoutToken =
        event?.data?.checkout?.token ||
        event?.context?.checkout?.token ||
        null;

      if (!checkoutToken) {
        console.log("No checkout token for event", eventName);
        return;
      }

      const payload = {
        eventName,
        checkoutToken,
        clientId: event?.clientId ?? null,
        timestamp: event?.timestamp ?? new Date().toISOString(),
        pageUrl: event?.context?.document?.location?.href ?? null,
        shopDomain:
          event?.context?.document?.location?.hostname?.replace(
            /^www\./,
            "",
          ) ?? null,
      };

      console.log("Sending payment attempt pixel event", payload);

      await browser.fetch("/apps/smart-insights/pixel-payment-attempt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Pixel sendEvent failed", error);
    }
  }

  analytics.subscribe("checkout_started", async (event) => {
    await sendEvent("checkout_started", event);
  });

  analytics.subscribe("payment_info_submitted", async (event) => {
    await sendEvent("payment_info_submitted", event);
  });

  analytics.subscribe("alert_displayed", async (event) => {
    await sendEvent("alert_displayed", event);
  });

  analytics.subscribe("checkout_completed", async (event) => {
    await sendEvent("checkout_completed", event);
  });

  analytics.subscribe("page_viewed", async (event) => {
    const url = event?.context?.document?.location?.href ?? "";

    if (url.includes("/checkouts/") || url.includes("/checkout")) {
      await sendEvent("page_viewed", event);
    }
  });
});