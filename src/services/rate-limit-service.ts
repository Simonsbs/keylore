import { SqlDatabase } from "../storage/database.js";
import { TelemetryService } from "./telemetry.js";

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds?: number;
  remaining: number;
}

interface RateLimitRow {
  request_count: string | number;
  window_started_at: string | Date;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export class PgRateLimitService {
  public constructor(
    private readonly database: SqlDatabase,
    private readonly windowMs: number,
    private readonly maxRequests: number,
    private readonly telemetry: TelemetryService,
  ) {}

  public async check(bucketKey: string): Promise<RateLimitResult> {
    const now = Date.now();
    let row: RateLimitRow | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        row = await this.database.withTransaction(async (client) => {
          const existing = await client.query<RateLimitRow>(
            "SELECT request_count, window_started_at FROM request_rate_limits WHERE bucket_key = $1",
            [bucketKey],
          );

          if (!existing.rows[0]) {
            const inserted = await client.query<RateLimitRow>(
              `INSERT INTO request_rate_limits (bucket_key, window_started_at, request_count, updated_at)
               VALUES ($1, NOW(), 1, NOW())
               RETURNING request_count, window_started_at`,
              [bucketKey],
            );
            return inserted.rows[0];
          }

          const current = existing.rows[0];
          const windowStartedAt = toDate(current.window_started_at).getTime();
          const expired = now - windowStartedAt >= this.windowMs;

          const updated = await client.query<RateLimitRow>(
            `UPDATE request_rate_limits
             SET request_count = $2,
                 window_started_at = $3,
                 updated_at = NOW()
             WHERE bucket_key = $1
             RETURNING request_count, window_started_at`,
            [
              bucketKey,
              expired ? 1 : Number(current.request_count) + 1,
              expired ? new Date(now).toISOString() : new Date(windowStartedAt).toISOString(),
            ],
          );
          return updated.rows[0];
        });
        break;
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : undefined;
        if (code === "23505" && attempt === 0) {
          continue;
        }
        throw error;
      }
    }

    if (!row) {
      throw new Error("Failed to update rate limit state.");
    }

    const requestCount = Number(row.request_count);
    const resetAt = toDate(row.window_started_at).getTime() + this.windowMs;
    const limited = requestCount > this.maxRequests;
    if (limited) {
      this.telemetry.recordRateLimitBlock("http");
    }

    return {
      limited,
      retryAfterSeconds: limited ? Math.max(1, Math.ceil((resetAt - now) / 1000)) : undefined,
      remaining: Math.max(0, this.maxRequests - requestCount),
    };
  }

  public async cleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - this.windowMs * 4).toISOString();
    const result = await this.database.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM request_rate_limits
         WHERE window_started_at < $1
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM deleted`,
      [cutoff],
    );

    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }
}
