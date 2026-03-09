export type AlertSeverity = "info" | "warning" | "critical" | "positive";

export function severityTone(severity: AlertSeverity) {
    switch (severity) {
        case "critical":
            return "critical";
        case "warning":
            return "warning";
        case "positive":
            return "success";
        case "info":
        default:
            return "info";
    }
}