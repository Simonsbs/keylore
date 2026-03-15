import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

interface HttpServiceMetadata {
  cwd: string;
  pid: number;
  logFile: string;
  startedAt: string;
}

interface HttpServicePaths {
  serviceDir: string;
  metadataFile: string;
  logFile: string;
}

function resolvePaths(): HttpServicePaths {
  const serviceDir = path.join(os.homedir(), ".keylore", "service");
  return {
    serviceDir,
    metadataFile: path.join(serviceDir, "http-service.json"),
    logFile: path.join(serviceDir, "http-service.log"),
  };
}

async function ensureServiceDir(paths: HttpServicePaths): Promise<void> {
  await fsp.mkdir(paths.serviceDir, { recursive: true });
}

async function readMetadata(paths: HttpServicePaths): Promise<HttpServiceMetadata | undefined> {
  try {
    const raw = await fsp.readFile(paths.metadataFile, "utf8");
    return JSON.parse(raw) as HttpServiceMetadata;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
    return undefined;
  }
}

async function writeMetadata(paths: HttpServicePaths, metadata: HttpServiceMetadata): Promise<void> {
  await ensureServiceDir(paths);
  await fsp.writeFile(paths.metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

async function removeMetadata(paths: HttpServicePaths): Promise<void> {
  await fsp.rm(paths.metadataFile, { force: true });
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function shouldPreferCurrentCwd(cwd: string): boolean {
  return (
    fs.existsSync(path.join(cwd, ".env")) ||
    (fs.existsSync(path.join(cwd, "data")) && fs.existsSync(path.join(cwd, "migrations")))
  );
}

async function resolveLaunchCwd(
  paths: HttpServicePaths,
  preferredCwd?: string,
): Promise<string> {
  const cwd = process.cwd();
  if (shouldPreferCurrentCwd(cwd)) {
    return cwd;
  }
  if (preferredCwd) {
    return preferredCwd;
  }
  const metadata = await readMetadata(paths);
  if (metadata?.cwd) {
    return metadata.cwd;
  }
  return cwd;
}

async function stopPid(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return;
  }
}

export async function runHttpServiceCommand(
  argv: string[],
  runtimeEntryPath: string,
): Promise<number> {
  const command = argv[0] ?? "start";
  const paths = resolvePaths();

  if (command === "run") {
    const child = spawn(process.execPath, [runtimeEntryPath, "--transport", "http"], {
      cwd: await resolveLaunchCwd(paths),
      env: process.env,
      stdio: "inherit",
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on("exit", (code, signal) => {
        if (signal) {
          resolve(1);
          return;
        }
        resolve(code ?? 0);
      });
    });
    return exitCode;
  }

  if (command === "status") {
    const metadata = await readMetadata(paths);
    if (!metadata || !isRunning(metadata.pid)) {
      await removeMetadata(paths);
      process.stdout.write("KeyLore HTTP is not running.\n");
      return 0;
    }

    process.stdout.write(
      `KeyLore HTTP is running.\nPID: ${metadata.pid}\nWorking directory: ${metadata.cwd}\nLog: ${metadata.logFile}\nStarted: ${metadata.startedAt}\n`,
    );
    return 0;
  }

  if (command === "stop") {
    const metadata = await readMetadata(paths);
    if (!metadata || !isRunning(metadata.pid)) {
      await removeMetadata(paths);
      process.stdout.write("KeyLore HTTP is not running.\n");
      return 0;
    }

    await stopPid(metadata.pid);
    await removeMetadata(paths);
    process.stdout.write("KeyLore HTTP stopped.\n");
    return 0;
  }

  let rememberedCwd: string | undefined;
  if (command === "restart") {
    const metadata = await readMetadata(paths);
    rememberedCwd = metadata?.cwd;
    if (metadata && isRunning(metadata.pid)) {
      await stopPid(metadata.pid);
      await removeMetadata(paths);
    } else {
      await removeMetadata(paths);
    }
  } else if (command !== "start") {
    process.stderr.write(
      "Usage: keylore-http [start|stop|restart|status|run]\n",
    );
    return 1;
  }

  const existing = await readMetadata(paths);
  if (existing && isRunning(existing.pid)) {
    process.stdout.write(
      `KeyLore HTTP is already running in the background.\nPID: ${existing.pid}\nLog: ${existing.logFile}\n`,
    );
    return 0;
  }

  await ensureServiceDir(paths);
  const cwd = await resolveLaunchCwd(paths, rememberedCwd);
  const logHandle = await fsp.open(paths.logFile, "a");
  const child = spawn(process.execPath, [runtimeEntryPath, "--transport", "http"], {
    cwd,
    env: process.env,
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
  });
  child.unref();
  await logHandle.close();

  const metadata: HttpServiceMetadata = {
    cwd,
    pid: child.pid ?? 0,
    logFile: paths.logFile,
    startedAt: new Date().toISOString(),
  };
  await writeMetadata(paths, metadata);
  process.stdout.write(
    `KeyLore HTTP started in the background.\nPID: ${metadata.pid}\nWorking directory: ${metadata.cwd}\nLog: ${metadata.logFile}\n`,
  );
  return 0;
}
