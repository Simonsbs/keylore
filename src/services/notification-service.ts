import { createHmac, randomUUID } from "node:crypto";

import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { TelemetryService } from "./telemetry.js";
import { TraceService } from "./trace-service.js";

export interface NotificationEnvelope {
  id: string;
  type: string;
  occurredAt: string;
  traceId?: string;
  payload: Record<string, unknown>;
}

export class NotificationService {
  public constructor(
    private readonly webhookUrl: string | undefined,
    private readonly signingSecret: string | undefined,
    private readonly timeoutMs: number,
    private readonly audit: PgAuditLogService,
    private readonly telemetry: TelemetryService,
    private readonly traces: TraceService,
  ) {}

  public async send(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.webhookUrl) {
      this.telemetry.recordNotificationDelivery(type, "disabled");
      return;
    }
    const webhookUrl = this.webhookUrl;

    const envelope: NotificationEnvelope = {
      id: randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      traceId: this.traces.currentTraceId(),
      payload,
    };

    const body = JSON.stringify(envelope);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-keylore-event-type": type,
      "x-keylore-event-id": envelope.id,
    };
    if (this.signingSecret) {
      headers["x-keylore-signature"] = createHmac("sha256", this.signingSecret).update(body).digest("hex");
    }

    await this.traces.withSpan("notification.delivery", { eventType: type }, async () => {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
          throw new Error(`Notification webhook responded with ${response.status}.`);
        }

        this.telemetry.recordNotificationDelivery(type, "success");
        await this.audit.record({
          type: "notification.delivery",
          action: `notification.${type}`,
          outcome: "success",
          principal: "keylore-system",
          metadata: {
            eventType: type,
            webhookUrl,
          },
        });
      } catch (error) {
        this.telemetry.recordNotificationDelivery(type, "error");
        await this.audit.record({
          type: "notification.delivery",
          action: `notification.${type}`,
          outcome: "error",
          principal: "keylore-system",
          metadata: {
            eventType: type,
            webhookUrl,
            error: error instanceof Error ? error.message : "Notification delivery failed.",
          },
        });
      }
    });
  }
}
