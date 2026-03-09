import { type AlertSeverity } from "./alerts.shared";

export type SmartAlert = {
    id: string;
    code: string;
    title: string;
    severity: AlertSeverity;
    description: string;
    metricValue?: number | string;
};

type OrderLike = {
    totalPrice: unknown;
    createdAt: Date | string;
    lineItems?: unknown;
};

function isWithinLastHours(date: Date, hours: number) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return diffMs <= hours * 60 * 60 * 1000;
}

function isWithinLastDays(date: Date, days: number) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return diffMs <= days * 24 * 60 * 60 * 1000;
}

export { isWithinLastHours, isWithinLastDays };


export function buildSmartAlerts(orders: OrderLike[]): SmartAlert[] {
    const alerts: SmartAlert[] = [];

    const normalizedOrders = orders.map((order) => ({
        ...order,
        createdAt:
            order.createdAt instanceof Date
                ? order.createdAt
                : new Date(order.createdAt),
        totalPrice: Number(order.totalPrice ?? 0),
    }));

    const totalOrders = normalizedOrders.length;

    const ordersLast24h = normalizedOrders.filter((order) =>
        isWithinLastHours(order.createdAt, 24),
    );

    const ordersLast7d = normalizedOrders.filter((order) =>
        isWithinLastDays(order.createdAt, 7),
    );

    const revenueLast24h = ordersLast24h.reduce(
        (sum, order) => sum + order.totalPrice,
        0,
    );

    const revenueLast7d = ordersLast7d.reduce(
        (sum, order) => sum + order.totalPrice,
        0,
    );

    if (ordersLast24h.length === 0 && totalOrders > 0) {
        alerts.push({
            id: "no-orders-24h",
            code: "NO_ORDERS_24H",
            title: "No orders in the last 24 hours",
            severity: "warning",
            description:
                "Your store has not received any orders in the last 24 hours. Check traffic, storefront availability, or checkout flow.",
            metricValue: 0,
        });
    }

    if (revenueLast7d > 0 && revenueLast24h < (revenueLast7d / 7) * 0.5) {
        alerts.push({
            id: "revenue-drop",
            code: "REVENUE_DROP_24H",
            title: "Revenue dropped compared to recent performance",
            severity: "critical",
            description:
                "Revenue in the last 24 hours is significantly lower than your recent 7-day average.",
            metricValue: revenueLast24h,
        });
    }

    if (ordersLast24h.length >= 5) {
        alerts.push({
            id: "high-order-activity",
            code: "HIGH_ORDER_ACTIVITY_24H",
            title: "High order activity detected",
            severity: "positive",
            description:
                "Your store has unusually strong order activity in the last 24 hours.",
            metricValue: ordersLast24h.length,
        });
    }

    const productMap: Record<
        string,
        { title: string; quantity: number; revenue: number }
    > = {};

    for (const order of normalizedOrders) {
        const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];

        for (const item of lineItems as any[]) {
            const title = item.title || "Unknown product";
            const quantity = Number(item.quantity ?? 0);
            const price = Number(item.price ?? 0);

            if (!productMap[title]) {
                productMap[title] = {
                    title,
                    quantity: 0,
                    revenue: 0,
                };
            }

            productMap[title].quantity += quantity;
            productMap[title].revenue += quantity * price;
        }
    }

    const topProduct = Object.values(productMap).sort(
        (a, b) => b.revenue - a.revenue,
    )[0];

    if (topProduct) {
        alerts.push({
            id: "top-product",
            code: "TOP_PRODUCT_ACTIVE",
            title: `Top product right now: ${topProduct.title}`,
            severity: "info",
            description:
                "This product is currently generating the most tracked revenue in your recent order data.",
            metricValue: topProduct.revenue.toFixed(2),
        });
    }

    return alerts;
}