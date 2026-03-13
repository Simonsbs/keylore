import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { KeyLoreConfig } from "../config.js";
import { RuntimeExecutionInput, RuntimeExecutionResult } from "../domain/types.js";

function redact(text: string, secret: string): string {
  return text
    .replaceAll(secret, "[REDACTED_SECRET]")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED_TOKEN]");
}

function truncate(text: string, maxLength: number): { value: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { value: text, truncated: false };
  }

  return {
    value: `${text.slice(0, maxLength)}\n...[truncated]`,
    truncated: true,
  };
}

export class SandboxRunner {
  public constructor(private readonly config: KeyLoreConfig) {}

  public async run(
    input: RuntimeExecutionInput,
    secret: string,
    secretEnvName: string,
  ): Promise<RuntimeExecutionResult> {
    if (!this.config.sandboxInjectionEnabled) {
      throw new Error("Sandbox injection mode is disabled.");
    }

    if (!this.config.sandboxCommandAllowlist.includes(input.command)) {
      throw new Error(`Command is not allowlisted for sandbox execution: ${input.command}`);
    }

    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "keylore-sandbox-"));
    const startedAt = Date.now();

    try {
      const result = await new Promise<{
        exitCode: number;
        timedOut: boolean;
        stdout: string;
        stderr: string;
      }>((resolve, reject) => {
        const child = spawn(input.command, input.args, {
          cwd,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            [secretEnvName]: secret,
            ...(input.env ?? {}),
          },
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timeoutMs = input.timeoutMs ?? this.config.sandboxDefaultTimeoutMs;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutMs);

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({
            exitCode: code ?? (timedOut ? 137 : 1),
            timedOut,
            stdout,
            stderr,
          });
        });
      });

      const stdout = truncate(redact(result.stdout, secret), this.config.sandboxMaxOutputBytes);
      const stderr = truncate(redact(result.stderr, secret), this.config.sandboxMaxOutputBytes);

      return {
        mode: "sandbox_injection",
        command: input.command,
        args: input.args,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: Date.now() - startedAt,
        stdoutPreview: stdout.value,
        stderrPreview: stderr.value,
        outputTruncated: stdout.truncated || stderr.truncated,
      };
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  }
}
