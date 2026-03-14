import { MaintenanceStatus, MaintenanceTaskResult } from "../domain/types.js";
import {
  AccessTokenRepository,
  ApprovalRepository,
  BreakGlassRepository,
  OAuthClientAssertionRepository,
} from "../repositories/interfaces.js";
import { PgRateLimitService } from "./rate-limit-service.js";
import { TelemetryService } from "./telemetry.js";

export class MaintenanceService {
  private timer: NodeJS.Timeout | undefined;

  private running = false;

  private statusSnapshot: MaintenanceStatus;

  public constructor(
    private readonly enabled: boolean,
    private readonly intervalMs: number,
    private readonly approvals: ApprovalRepository,
    private readonly breakGlass: BreakGlassRepository,
    private readonly tokens: AccessTokenRepository,
    private readonly rateLimits: PgRateLimitService,
    private readonly assertions: OAuthClientAssertionRepository,
    private readonly telemetry: TelemetryService,
  ) {
    this.statusSnapshot = {
      enabled,
      intervalMs,
      running: false,
      consecutiveFailures: 0,
    };
  }

  public start(): void {
    if (!this.enabled || this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runOnce("scheduled");
    }, this.intervalMs);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public status(): MaintenanceStatus {
    return { ...this.statusSnapshot };
  }

  public async runOnce(task = "manual"): Promise<MaintenanceTaskResult> {
    if (this.running) {
      throw new Error("Maintenance is already running.");
    }

    this.running = true;
    this.statusSnapshot.running = true;
    this.statusSnapshot.lastRunAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      const result = {
        approvalsExpired: await this.approvals.expireStale(),
        breakGlassExpired: await this.breakGlass.expireStale(),
        accessTokensExpired: await this.tokens.expireStale(),
        rateLimitBucketsDeleted: await this.rateLimits.cleanup(),
        oauthClientAssertionsExpired: await this.assertions.cleanup(),
      };
      const durationMs = Date.now() - startedAt;

      this.statusSnapshot = {
        ...this.statusSnapshot,
        running: false,
        lastSuccessAt: new Date().toISOString(),
        lastDurationMs: durationMs,
        consecutiveFailures: 0,
        lastError: undefined,
        lastResult: result,
      };
      this.telemetry.recordMaintenanceRun(task, "success", durationMs);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.statusSnapshot = {
        ...this.statusSnapshot,
        running: false,
        lastDurationMs: durationMs,
        consecutiveFailures: this.statusSnapshot.consecutiveFailures + 1,
        lastError: error instanceof Error ? error.message : "Maintenance failed.",
      };
      this.telemetry.recordMaintenanceRun(task, "error", durationMs);
      throw error;
    } finally {
      this.running = false;
      this.statusSnapshot.running = false;
    }
  }
}
