import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { TraceSpan, traceSpanSchema } from "../domain/types.js";

interface TraceContext {
  traceId: string;
  spanStack: string[];
}

export class TraceService {
  private readonly storage = new AsyncLocalStorage<TraceContext>();

  private readonly spans: TraceSpan[] = [];

  private exporter:
    | {
        enqueue(span: TraceSpan): void;
      }
    | undefined;

  public constructor(
    private readonly enabled: boolean,
    private readonly recentSpanLimit: number,
  ) {}

  public runWithTrace<T>(traceId: string, fn: () => Promise<T> | T): Promise<T> {
    if (!this.enabled) {
      return Promise.resolve(fn());
    }

    return Promise.resolve(this.storage.run({ traceId, spanStack: [] }, fn));
  }

  public currentTraceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }

  public async withSpan<T>(
    name: string,
    attributes: Record<string, unknown>,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    if (!this.enabled) {
      return Promise.resolve(fn());
    }

    const current = this.storage.getStore();
    const traceId = current?.traceId ?? randomUUID();
    const spanId = randomUUID();
    const parentSpanId = current?.spanStack.at(-1);
    const startedAt = new Date();

    const context: TraceContext = {
      traceId,
      spanStack: [...(current?.spanStack ?? []), spanId],
    };

    const execute = async () => {
      try {
        const result = await fn();
        this.record({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startedAt.toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime()),
          status: "ok",
          attributes,
        });
        return result;
      } catch (error) {
        this.record({
          spanId,
          traceId,
          parentSpanId,
          name,
          startedAt: startedAt.toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime()),
          status: "error",
          attributes: {
            ...attributes,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
        throw error;
      }
    };

    return this.storage.run(context, execute);
  }

  public recent(limit = 20, traceId?: string): TraceSpan[] {
    const filtered = traceId ? this.spans.filter((span) => span.traceId === traceId) : this.spans;
    return filtered.slice(Math.max(0, filtered.length - limit)).reverse();
  }

  public attachExporter(exporter: { enqueue(span: TraceSpan): void }): void {
    this.exporter = exporter;
  }

  private record(span: TraceSpan): void {
    const parsed = traceSpanSchema.parse(span);
    this.spans.push(parsed);
    if (this.spans.length > this.recentSpanLimit) {
      this.spans.splice(0, this.spans.length - this.recentSpanLimit);
    }
    this.exporter?.enqueue(parsed);
  }
}
