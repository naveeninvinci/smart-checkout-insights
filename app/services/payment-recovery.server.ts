export type ShopifyTransactionLike = {
    gateway?: string | null;
    status?: string | null;
    kind?: string | null;
    createdAt?: string | null;
    errorCode?: string | null;
    manualPaymentGateway?: boolean | null;
};

export type DetectedRecoveredPaymentSwitch = {
    switchDetected: boolean;
    failedGateway: string | null;
    failedStatus: string | null;
    failedKind: string | null;
    failedAt: string | null;
    failedErrorCode: string | null;
    successfulGateway: string | null;
    successfulStatus: string | null;
    successfulKind: string | null;
    successfulAt: string | null;
    notes: string | null;
};

function normalizeGateway(value: string | null | undefined): string | null {
    if (!value) return null;

    const gateway = value.toLowerCase().trim();

    if (gateway.includes("paypal")) return "PayPal";

    if (
        gateway.includes("bogus") ||
        gateway.includes("card") ||
        gateway.includes("credit") ||
        gateway.includes("visa") ||
        gateway.includes("mastercard") ||
        gateway.includes("stripe")
    ) {
        return "Card";
    }

    if (gateway.includes("cash on delivery") || gateway.includes("cod")) {
        return "Cash on Delivery";
    }

    if (gateway.includes("bank")) return "Bank Deposit";
    if (gateway.includes("manual")) return "Bank Deposit";
    if (gateway.includes("shop pay")) return "Shop Pay";

    return value;
}

function isFailureStatus(status: string | null | undefined): boolean {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === "failure" || s === "error";
}

function isCompletedLikeSuccess(tx: ShopifyTransactionLike): boolean {
    if (!tx.status) return false;

    const status = tx.status.toLowerCase();

    if (status === "success") return true;

    // Manual methods like COD / Bank Deposit may stay pending
    // even though the order was successfully completed.
    if (status === "pending" && tx.manualPaymentGateway) return true;

    return false;
}

function isRefundKind(kind: string | null | undefined): boolean {
    if (!kind) return false;
    return kind.toLowerCase() === "refund";
}

export function detectRecoveredPaymentSwitch(
    transactions: ShopifyTransactionLike[],
): DetectedRecoveredPaymentSwitch {
    const sorted = [...transactions].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
    });

    const failures = sorted.filter((tx) => isFailureStatus(tx.status));

    const successfulTx = sorted.find(
        (tx) => isCompletedLikeSuccess(tx) && !isRefundKind(tx.kind),
    );

    if (!successfulTx || failures.length === 0) {
        return {
            switchDetected: false,
            failedGateway: failures[0]
                ? normalizeGateway(failures[0].gateway ?? null)
                : null,
            failedStatus: failures[0]?.status ?? null,
            failedKind: failures[0]?.kind ?? null,
            failedAt: failures[0]?.createdAt ?? null,
            failedErrorCode: failures[0]?.errorCode ?? null,
            successfulGateway: successfulTx
                ? normalizeGateway(successfulTx.gateway ?? null)
                : null,
            successfulStatus: successfulTx?.status ?? null,
            successfulKind: successfulTx?.kind ?? null,
            successfulAt: successfulTx?.createdAt ?? null,
            notes: null,
        };
    }

    const normalizedSuccessGateway = normalizeGateway(successfulTx.gateway ?? null);

    const relevantFailure =
        failures.find((tx) => {
            const normalizedFailedGateway = normalizeGateway(tx.gateway ?? null);
            return (
                normalizedFailedGateway &&
                normalizedSuccessGateway &&
                normalizedFailedGateway !== normalizedSuccessGateway
            );
        }) ?? failures[0];

    const normalizedFailedGateway = normalizeGateway(relevantFailure.gateway ?? null);

    const switchDetected =
        !!normalizedFailedGateway &&
        !!normalizedSuccessGateway &&
        normalizedFailedGateway !== normalizedSuccessGateway;

    return {
        switchDetected,
        failedGateway: normalizedFailedGateway,
        failedStatus: relevantFailure.status ?? null,
        failedKind: relevantFailure.kind ?? null,
        failedAt: relevantFailure.createdAt ?? null,
        failedErrorCode: relevantFailure.errorCode ?? null,
        successfulGateway: normalizedSuccessGateway,
        successfulStatus: successfulTx.status ?? null,
        successfulKind: successfulTx.kind ?? null,
        successfulAt: successfulTx.createdAt ?? null,
        notes: switchDetected
            ? `A failed payment attempt was recorded before the order completed with ${normalizedSuccessGateway}.`
            : null,
    };
}