import prisma from "../db.server";

export async function markAbandonedPaymentAttemptSessions(shopId: string) {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);

    await prisma.paymentAttemptSession.updateMany({
        where: {
            shopId,
            status: "open",
            matchedOrderId: null,
            completedAt: null,
            paymentInfoSubmittedCount: {
                gt: 0,
            },
            lastSeenAt: {
                lt: cutoff,
            },
        },
        data: {
            abandonedAfterPaymentAttempt: true,
            status: "abandoned_after_payment_attempt",
        },
    });
}