export interface ParsedCliArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
}

function normalizeFlagName(flag: string): string {
  return flag.replace(/^--/, "");
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const trimmed = normalizeFlagName(token);
    if (trimmed.includes("=")) {
      const equalsIndex = trimmed.indexOf("=");
      const name = trimmed.slice(0, equalsIndex);
      const value = trimmed.slice(equalsIndex + 1);
      flags.set(name, value);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(trimmed, true);
      continue;
    }

    flags.set(trimmed, next);
    index += 1;
  }

  return { positionals, flags };
}

export function readStringFlag(
  flags: Map<string, string | boolean>,
  name: string,
): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function readBooleanFlag(
  flags: Map<string, string | boolean>,
  name: string,
): boolean {
  return flags.get(name) === true;
}

export function readNumberFlag(
  flags: Map<string, string | boolean>,
  name: string,
): number | undefined {
  const value = readStringFlag(flags, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Flag --${name} must be an integer.`);
  }

  return parsed;
}
