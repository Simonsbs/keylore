interface MetricEntry {
  labels: Record<string, string>;
  value: number;
}

interface SummaryEntry {
  labels: Record<string, string>;
  count: number;
  sum: number;
  max: number;
}

function labelKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function renderLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return "";
  }

  const body = entries
    .map(([key, value]) => `${key}="${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`)
    .join(",");
  return `{${body}}`;
}

export class TelemetryService {
  private readonly startedAt = Date.now();

  private readonly counters = new Map<string, Map<string, MetricEntry>>();

  private readonly gauges = new Map<string, Map<string, MetricEntry>>();

  private readonly summaries = new Map<string, Map<string, SummaryEntry>>();

  private getCounter(name: string) {
    let metric = this.counters.get(name);
    if (!metric) {
      metric = new Map();
      this.counters.set(name, metric);
    }
    return metric;
  }

  private getGauge(name: string) {
    let metric = this.gauges.get(name);
    if (!metric) {
      metric = new Map();
      this.gauges.set(name, metric);
    }
    return metric;
  }

  private getSummary(name: string) {
    let metric = this.summaries.get(name);
    if (!metric) {
      metric = new Map();
      this.summaries.set(name, metric);
    }
    return metric;
  }

  public incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const metric = this.getCounter(name);
    const key = labelKey(labels);
    const current = metric.get(key);
    metric.set(key, {
      labels,
      value: (current?.value ?? 0) + value,
    });
  }

  public setGauge(name: string, labels: Record<string, string> = {}, value: number): void {
    this.getGauge(name).set(labelKey(labels), {
      labels,
      value,
    });
  }

  public adjustGauge(name: string, labels: Record<string, string> = {}, delta: number): void {
    const metric = this.getGauge(name);
    const key = labelKey(labels);
    const current = metric.get(key);
    metric.set(key, {
      labels,
      value: (current?.value ?? 0) + delta,
    });
  }

  public observeSummary(name: string, labels: Record<string, string> = {}, value: number): void {
    const metric = this.getSummary(name);
    const key = labelKey(labels);
    const current = metric.get(key);
    metric.set(key, {
      labels,
      count: (current?.count ?? 0) + 1,
      sum: (current?.sum ?? 0) + value,
      max: Math.max(current?.max ?? value, value),
    });
  }

  public recordHttpRequest(
    route: string,
    method: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const labels = {
      route,
      method,
      status_class: `${Math.floor(statusCode / 100)}xx`,
    };
    this.incrementCounter("keylore_http_requests_total", labels);
    this.observeSummary("keylore_http_request_duration_ms", labels, durationMs);
  }

  public recordRateLimitBlock(scope: string): void {
    this.incrementCounter("keylore_rate_limit_blocks_total", { scope });
  }

  public recordAuthTokenIssued(outcome: "success" | "error"): void {
    this.incrementCounter("keylore_auth_token_issuance_total", { outcome });
  }

  public recordAuthTokenValidation(outcome: "success" | "error"): void {
    this.incrementCounter("keylore_auth_token_validation_total", { outcome });
  }

  public recordAdapterOperation(
    adapter: string,
    operation: "resolve" | "inspect" | "healthcheck",
    outcome: "success" | "error" | "retry" | "open_circuit",
  ): void {
    this.incrementCounter("keylore_adapter_operations_total", {
      adapter,
      operation,
      outcome,
    });
  }

  public recordMaintenanceRun(
    task: string,
    outcome: "success" | "error",
    durationMs: number,
  ): void {
    this.incrementCounter("keylore_maintenance_runs_total", { task, outcome });
    this.observeSummary("keylore_maintenance_duration_ms", { task, outcome }, durationMs);
    this.setGauge("keylore_maintenance_last_run_timestamp_seconds", { task }, Math.floor(Date.now() / 1000));
  }

  public recordNotificationDelivery(
    eventType: string,
    outcome: "success" | "error" | "disabled",
  ): void {
    this.incrementCounter("keylore_notification_deliveries_total", { event_type: eventType, outcome });
  }

  public recordTraceExport(outcome: "success" | "error" | "disabled", batchSize: number): void {
    this.incrementCounter("keylore_trace_exports_total", { outcome });
    this.observeSummary("keylore_trace_export_batch_size", { outcome }, batchSize);
  }

  public recordRotationRun(action: string, outcome: "success" | "error"): void {
    this.incrementCounter("keylore_rotation_runs_total", { action, outcome });
  }

  public renderPrometheus(): string {
    const lines: string[] = [
      "# HELP keylore_process_start_time_seconds Process start time in Unix seconds.",
      "# TYPE keylore_process_start_time_seconds gauge",
      `keylore_process_start_time_seconds ${Math.floor(this.startedAt / 1000)}`,
    ];

    for (const [name, metric] of this.counters.entries()) {
      lines.push(`# TYPE ${name} counter`);
      for (const entry of metric.values()) {
        lines.push(`${name}${renderLabels(entry.labels)} ${entry.value}`);
      }
    }

    for (const [name, metric] of this.gauges.entries()) {
      lines.push(`# TYPE ${name} gauge`);
      for (const entry of metric.values()) {
        lines.push(`${name}${renderLabels(entry.labels)} ${entry.value}`);
      }
    }

    for (const [name, metric] of this.summaries.entries()) {
      lines.push(`# TYPE ${name} summary`);
      for (const entry of metric.values()) {
        lines.push(`${name}_count${renderLabels(entry.labels)} ${entry.count}`);
        lines.push(`${name}_sum${renderLabels(entry.labels)} ${entry.sum}`);
        lines.push(`${name}_max${renderLabels(entry.labels)} ${entry.max}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }
}
