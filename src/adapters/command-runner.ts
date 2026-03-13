import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(
    command: string,
    args: string[],
    options?: {
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
    },
  ): Promise<CommandResult>;
}

export class ExecFileCommandRunner implements CommandRunner {
  public async run(
    command: string,
    args: string[],
    options?: {
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
    },
  ): Promise<CommandResult> {
    const result = await execFileAsync(command, args, {
      env: options?.env,
      timeout: options?.timeoutMs,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}
