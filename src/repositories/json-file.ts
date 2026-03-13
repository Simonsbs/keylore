import fs from "node:fs/promises";
import path from "node:path";

export async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readTextFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function writeTextFile(filePath: string, text: string): Promise<void> {
  await ensureParentDirectory(filePath);
  await fs.writeFile(filePath, text, "utf8");
}
