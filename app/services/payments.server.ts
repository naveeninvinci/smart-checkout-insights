export function normalizePaymentMethod(
    primaryPaymentMethod: string | null | undefined,
    paymentGatewayNames: unknown,
): string {
    const rawValues = [
        primaryPaymentMethod,
        ...(Array.isArray(paymentGatewayNames) ? paymentGatewayNames : []),
    ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase().trim());

    if (rawValues.length === 0) {
        return "Unknown";
    }

    const joined = rawValues.join(" | ");

    if (joined.includes("paypal")) {
        return "PayPal";
    }

    if (
        joined.includes("bogus") ||
        joined.includes("credit card") ||
        joined.includes("card") ||
        joined.includes("visa") ||
        joined.includes("mastercard") ||
        joined.includes("amex") ||
        joined.includes("american express") ||
        joined.includes("stripe")
    ) {
        return "Card";
    }

    if (
        joined.includes("bank deposit") ||
        joined.includes("bank transfer") ||
        joined.includes("manual")
    ) {
        return "Bank Deposit";
    }

    if (
        joined.includes("cash on delivery") ||
        joined.includes("cod")
    ) {
        return "Cash on Delivery";
    }

    if (
        joined.includes("shop pay") ||
        joined.includes("shop_pay")
    ) {
        return "Shop Pay";
    }

    return "Other";
}

export function normalizeSinglePaymentMethod(method: string | null | undefined): string {
    if (!method) return "Unknown";

    const m = method.toLowerCase().trim();

    if (m.includes("paypal")) return "PayPal";

    if (
        m.includes("bogus") ||
        m.includes("credit card") ||
        m.includes("card") ||
        m.includes("visa") ||
        m.includes("mastercard") ||
        m.includes("amex") ||
        m.includes("american express") ||
        m.includes("stripe")
    ) {
        return "Card";
    }

    if (
        m.includes("bank deposit") ||
        m.includes("bank transfer") ||
        m.includes("manual")
    ) {
        return "Bank Deposit";
    }

    if (m.includes("cash on delivery") || m.includes("cod")) {
        return "Cash on Delivery";
    }

    if (m.includes("shop pay") || m.includes("shop_pay")) {
        return "Shop Pay";
    }

    return "Other";
}