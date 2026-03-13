import { PolicyFile, policyFileSchema } from "../domain/types.js";
import { readTextFile, writeTextFile } from "./json-file.js";

export class JsonPolicyRepository {
  public constructor(private readonly filePath: string) {}

  public async ensureInitialized(): Promise<void> {
    const text = await readTextFile(this.filePath);
    if (text) {
      policyFileSchema.parse(JSON.parse(text));
      return;
    }

    const emptyPolicy: PolicyFile = { version: 1, rules: [] };
    await writeTextFile(this.filePath, `${JSON.stringify(emptyPolicy, null, 2)}\n`);
  }

  public async read(): Promise<PolicyFile> {
    const text = await readTextFile(this.filePath);
    if (!text) {
      return { version: 1, rules: [] };
    }

    return policyFileSchema.parse(JSON.parse(text));
  }
}
