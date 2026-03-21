import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type AlertEmailItem = {
    title: string;
    severity: string;
    description: string;
    metricValue?: string | number | null;
};

type SendAlertSummaryEmailParams = {
    to: string;
    shopDomain: string;
    alerts: AlertEmailItem[];
};

function getSeverityColors(severity: string) {
    switch (severity) {
        case "critical":
            return {
                bg: "#FDECEC",
                text: "#C62828",
                border: "#F5C2C0",
            };
        case "warning":
            return {
                bg: "#FFF4E5",
                text: "#B26A00",
                border: "#FFD8A8",
            };
        case "positive":
            return {
                bg: "#EAF7ED",
                text: "#1B7F3B",
                border: "#B7E1C1",
            };
        case "info":
        default:
            return {
                bg: "#EAF3FF",
                text: "#1F5FBF",
                border: "#BFD7FF",
            };
    }
}

export async function sendAlertSummaryEmail({
    to,
    shopDomain,
    alerts,
}: SendAlertSummaryEmailParams) {
    if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
    }

    if (!process.env.ALERT_FROM_EMAIL) {
        throw new Error("ALERT_FROM_EMAIL is not configured");
    }

    if (alerts.length === 0) {
        return;
    }

    const subject =
        alerts.length === 1
            ? `[Smart Checkout Insights] ${alerts[0].title}`
            : `[Smart Checkout Insights] ${alerts.length} new alerts detected`;

    const dashboardUrl =
        process.env.SHOPIFY_APP_URL
            ? `${process.env.SHOPIFY_APP_URL}/app/alerts`
            : null;

    const alertsHtml = alerts
        .map((alert) => {
            const colors = getSeverityColors(alert.severity);

            return `
        <div style="
          border: 1px solid #E5E7EB;
          border-left: 4px solid ${colors.text};
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 14px;
          background: #FFFFFF;
        ">
          <div style="margin-bottom: 10px;">
            <span style="
              display: inline-block;
              padding: 4px 10px;
              border-radius: 999px;
              background: ${colors.bg};
              color: ${colors.text};
              border: 1px solid ${colors.border};
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            ">
              ${alert.severity}
            </span>
          </div>

          <div style="
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 8px;
          ">
            ${alert.title}
          </div>

          <div style="
            font-size: 14px;
            color: #374151;
            line-height: 1.6;
            margin-bottom: ${alert.metricValue !== undefined && alert.metricValue !== null ? "10px" : "0"
                };
          ">
            ${alert.description}
          </div>

          ${alert.metricValue !== undefined && alert.metricValue !== null
                    ? `
                <div style="
                  font-size: 14px;
                  color: #111827;
                  background: #F9FAFB;
                  border: 1px solid #E5E7EB;
                  border-radius: 8px;
                  padding: 10px 12px;
                  display: inline-block;
                ">
                  <strong>Metric value:</strong> ${String(alert.metricValue)}
                </div>
              `
                    : ""
                }
        </div>
      `;
        })
        .join("");

    return resend.emails.send({
        from: process.env.ALERT_FROM_EMAIL,
        to,
        subject,
        html: `
      <div style="
        margin: 0;
        padding: 24px 0;
        background: #F3F4F6;
        font-family: Arial, sans-serif;
        color: #111827;
      ">
        <div style="
          max-width: 680px;
          margin: 0 auto;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 16px;
          overflow: hidden;
        ">
          <div style="
            background: #111827;
            color: #FFFFFF;
            padding: 24px 28px;
          ">
            <div style="
              font-size: 13px;
              letter-spacing: 0.4px;
              text-transform: uppercase;
              opacity: 0.85;
              margin-bottom: 8px;
            ">
              Smart Checkout Insights
            </div>
            <h1 style="
              margin: 0;
              font-size: 28px;
              line-height: 1.2;
              font-weight: 800;
            ">
              ${alerts.length === 1 ? "New alert detected" : `${alerts.length} new alerts detected`}
            </h1>
          </div>

          <div style="padding: 28px;">
            <div style="
              font-size: 15px;
              color: #374151;
              line-height: 1.7;
              margin-bottom: 22px;
            ">
              Your store <strong>${shopDomain}</strong> has ${alerts.length === 1 ? "a new alert" : "new alerts"
            } that may need attention.
            </div>

            <div style="
              display: inline-block;
              background: #F9FAFB;
              border: 1px solid #E5E7EB;
              border-radius: 10px;
              padding: 12px 14px;
              margin-bottom: 24px;
              font-size: 14px;
              color: #111827;
            ">
              <strong>Shop:</strong> ${shopDomain}<br />
              <strong>Alerts in this sync:</strong> ${alerts.length}
            </div>

            ${alertsHtml}

            ${dashboardUrl
                ? `
                  <div style="margin-top: 28px; margin-bottom: 8px;">
                    <a
                      href="${dashboardUrl}"
                      style="
                        display: inline-block;
                        background: #111827;
                        color: #FFFFFF;
                        text-decoration: none;
                        padding: 12px 18px;
                        border-radius: 10px;
                        font-size: 14px;
                        font-weight: 700;
                      "
                    >
                      Open Dashboard
                    </a>
                  </div>
                `
                : ""
            }
          </div>

          <div style="
            border-top: 1px solid #E5E7EB;
            background: #F9FAFB;
            padding: 18px 28px;
            font-size: 13px;
            color: #6B7280;
            line-height: 1.6;
          ">
            This alert summary was generated by <strong>Smart Checkout Insights</strong>.
          </div>
        </div>
      </div>
    `,
    });
}