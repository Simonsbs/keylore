import { TraceExportStatus, TraceSpan, traceExportStatusSchema } from "../domain/types.js";
import { TelemetryService } from "./telemetry.js";

export class TraceExportService {
  private readonly queue: TraceSpan[] = [];

  private timer: NodeJS.Timeout | undefined;

  private flushing = false;

  private snapshot: TraceExportStatus;

  public constructor(
    private readonly endpoint: string | undefined,
    private readonly authHeader: string | undefined,
    private readonly batchSize: number,
    private readonly intervalMs: number,
    private readonly timeoutMs: number,
    private readonly telemetry: TelemetryService,
  ) {
    this.snapshot = traceExportStatusSchema.parse({
      enabled: Boolean(endpoint),
      endpoint,
      pendingSpans: 0,
      consecutiveFailures: 0,
      running: false,
    });
  }

  public start(): void {
    if (!this.endpoint || this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.flushNow();
    }, this.intervalMs);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.flushNow();
  }

  public enqueue(span: TraceSpan): void {
    if (!this.endpoint) {
      return;
    }
    this.queue.push(span);
    this.snapshot.pendingSpans = this.queue.length;
    if (this.queue.length >= this.batchSize) {
      void this.flushNow();
    }
  }

  public status(): TraceExportStatus {
    return traceExportStatusSchema.parse({
      ...this.snapshot,
      pendingSpans: this.queue.length,
      running: this.flushing,
    });
  }

  public async flushNow(): Promise<TraceExportStatus> {
    if (!this.endpoint) {
      this.telemetry.recordTraceExport("disabled", 0);
      return this.status();
    }
    if (this.flushing || this.queue.length === 0) {
      return this.status();
    }

    this.flushing = true;
    this.snapshot.running = true;
    const batch = this.queue.splice(0, this.batchSize);
    this.snapshot.pendingSpans = this.queue.length;

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.authHeader) {
        headers.authorization = this.authHeader;
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          exportedAt: new Date().toISOString(),
          spans: batch,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Trace export endpoint responded with ${response.status}.`);
      }

      this.snapshot = traceExportStatusSchema.parse({
        ...this.snapshot,
        endpoint: this.endpoint,
        enabled: true,
        pendingSpans: this.queue.length,
        lastFlushAt: new Date().toISOString(),
        lastBatchSize: batch.length,
        lastError: undefined,
        consecutiveFailures: 0,
        running: false,
      });
      this.telemetry.recordTraceExport("success", batch.length);
      return this.status();
    } catch (error) {
      this.queue.unshift(...batch);
      this.snapshot = traceExportStatusSchema.parse({
        ...this.snapshot,
        endpoint: this.endpoint,
        enabled: true,
        pendingSpans: this.queue.length,
        lastBatchSize: batch.length,
        lastError: error instanceof Error ? error.message : "Trace export failed.",
        consecutiveFailures: this.snapshot.consecutiveFailures + 1,
        running: false,
      });
      this.telemetry.recordTraceExport("error", batch.length);
      return this.status();
    } finally {
      this.flushing = false;
      this.snapshot.running = false;
    }
  }
}
