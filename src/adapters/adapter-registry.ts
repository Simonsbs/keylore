import {
  AdapterHealth,
  CredentialRecord,
  SecretInspection,
} from "../domain/types.js";
import { KeyLoreConfig } from "../config.js";
import { TelemetryService } from "../services/telemetry.js";
import { ResolvedSecret, SecretAdapter } from "./types.js";

interface AdapterRuntimeState {
  consecutiveFailures: number;
  lastError?: string;
  lastSuccessAt?: string;
  circuitOpenUntil?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|503|502|504)/i.test(message);
}

export class SecretAdapterRegistry {
  private readonly adapters = new Map<CredentialRecord["binding"]["adapter"], SecretAdapter>();

  private readonly state = new Map<CredentialRecord["binding"]["adapter"], AdapterRuntimeState>();

  public constructor(
    adapters: SecretAdapter[],
    private readonly config: Pick<
      KeyLoreConfig,
      | "adapterMaxAttempts"
      | "adapterRetryDelayMs"
      | "adapterCircuitBreakerThreshold"
      | "adapterCircuitBreakerCooldownMs"
    >,
    private readonly telemetry: TelemetryService,
  ) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.id, adapter);
      this.state.set(adapter.id, { consecutiveFailures: 0 });
    }
  }

  private adapterFor(credential: CredentialRecord): SecretAdapter {
    const adapter = this.adapters.get(credential.binding.adapter);
    if (!adapter) {
      throw new Error(`Unsupported secret adapter: ${credential.binding.adapter}`);
    }

    return adapter;
  }

  private stateFor(adapterId: CredentialRecord["binding"]["adapter"]): AdapterRuntimeState {
    let state = this.state.get(adapterId);
    if (!state) {
      state = { consecutiveFailures: 0 };
      this.state.set(adapterId, state);
    }
    return state;
  }

  private circuitOpen(adapterId: CredentialRecord["binding"]["adapter"]): AdapterRuntimeState | undefined {
    const state = this.stateFor(adapterId);
    if (state.circuitOpenUntil && state.circuitOpenUntil > Date.now()) {
      return state;
    }
    if (state.circuitOpenUntil && state.circuitOpenUntil <= Date.now()) {
      state.circuitOpenUntil = undefined;
    }
    return undefined;
  }

  private markSuccess(adapterId: CredentialRecord["binding"]["adapter"]): void {
    const state = this.stateFor(adapterId);
    state.consecutiveFailures = 0;
    state.lastError = undefined;
    state.lastSuccessAt = new Date().toISOString();
    state.circuitOpenUntil = undefined;
  }

  private markFailure(adapterId: CredentialRecord["binding"]["adapter"], error: unknown): AdapterRuntimeState {
    const state = this.stateFor(adapterId);
    state.consecutiveFailures += 1;
    state.lastError = error instanceof Error ? error.message : "Unknown adapter error.";
    if (state.consecutiveFailures >= this.config.adapterCircuitBreakerThreshold) {
      state.circuitOpenUntil = Date.now() + this.config.adapterCircuitBreakerCooldownMs;
    }
    return state;
  }

  private async execute<T>(
    adapter: SecretAdapter,
    operation: "resolve" | "inspect" | "healthcheck",
    task: () => Promise<T>,
  ): Promise<T> {
    const openCircuit = this.circuitOpen(adapter.id);
    if (openCircuit && operation !== "healthcheck") {
      this.telemetry.recordAdapterOperation(adapter.id, operation, "open_circuit");
      throw new Error(
        `Adapter circuit is open for ${adapter.id} until ${new Date(openCircuit.circuitOpenUntil ?? Date.now()).toISOString()}.`,
      );
    }

    for (let attempt = 1; attempt <= this.config.adapterMaxAttempts; attempt += 1) {
      try {
        const result = await task();
        this.markSuccess(adapter.id);
        this.telemetry.recordAdapterOperation(adapter.id, operation, "success");
        return result;
      } catch (error) {
        const state = this.markFailure(adapter.id, error);
        const shouldRetry =
          attempt < this.config.adapterMaxAttempts &&
          transientError(error) &&
          !state.circuitOpenUntil;
        if (shouldRetry) {
          this.telemetry.recordAdapterOperation(adapter.id, operation, "retry");
          await sleep(this.config.adapterRetryDelayMs * attempt);
          continue;
        }

        this.telemetry.recordAdapterOperation(adapter.id, operation, "error");
        throw error;
      }
    }

    throw new Error(`Adapter operation failed unexpectedly: ${adapter.id}`);
  }

  public async resolve(credential: CredentialRecord): Promise<ResolvedSecret> {
    const adapter = this.adapterFor(credential);
    return this.execute(adapter, "resolve", () => adapter.resolve(credential));
  }

  public async inspectCredential(credential: CredentialRecord): Promise<SecretInspection> {
    const adapter = this.adapterFor(credential);
    try {
      return await this.execute(adapter, "inspect", () => adapter.inspect(credential));
    } catch (error) {
      return {
        adapter: credential.binding.adapter,
        ref: credential.binding.ref,
        status: "error",
        resolved: false,
        notes: [],
        error: error instanceof Error ? error.message : "Inspection failed.",
      };
    }
  }

  public async healthchecks(): Promise<AdapterHealth[]> {
    return Promise.all(
      Array.from(this.adapters.values(), async (adapter) => {
        const state = this.stateFor(adapter.id);
        if (this.circuitOpen(adapter.id)) {
          return {
            adapter: adapter.id,
            available: false,
            status: "error",
            details: `Circuit open after repeated failures: ${state.lastError ?? "unknown error"}`,
          };
        }

        try {
          const health = await this.execute(adapter, "healthcheck", () => adapter.healthcheck());
          if (state.consecutiveFailures > 0 && health.status === "ok") {
            return {
              ...health,
              status: "warning",
              details: `${health.details} Recent failures: ${state.consecutiveFailures}.`,
            };
          }
          return health;
        } catch (error) {
          return {
            adapter: adapter.id,
            available: false,
            status: "error",
            details: error instanceof Error ? error.message : "Adapter healthcheck failed.",
          };
        }
      }),
    );
  }
}
