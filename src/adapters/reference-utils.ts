function splitRef(ref: string): {
  resource: string;
  field: string | undefined;
  query: URLSearchParams;
} {
  const [pathPart = "", queryPart = ""] = ref.split("?", 2);
  const [resource = "", field] = pathPart.split("#", 2);

  return {
    resource,
    field: field || undefined,
    query: new URLSearchParams(queryPart),
  };
}

export function parseRef(ref: string) {
  return splitRef(ref);
}

export function extractField(value: unknown, fieldPath?: string): string {
  if (!fieldPath) {
    if (typeof value === "string") {
      return value;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (entries.length === 1 && typeof entries[0]?.[1] === "string") {
        return entries[0][1];
      }
    }

    throw new Error("Secret reference requires a field selector for structured data.");
  }

  const segments = fieldPath.split(".").filter(Boolean);
  let current: unknown = value;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      throw new Error(`Secret field not found: ${fieldPath}`);
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current !== "string") {
    throw new Error(`Secret field is not a string: ${fieldPath}`);
  }

  return current;
}

export function daysUntil(timestamp: string | null): number | null {
  if (!timestamp) {
    return null;
  }

  return Math.ceil((new Date(timestamp).getTime() - Date.now()) / 86_400_000);
}
