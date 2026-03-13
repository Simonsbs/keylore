import { createHash } from "node:crypto";

import { AccessRequestInput, AuthContext } from "../domain/types.js";

export function accessFingerprint(context: AuthContext, input: AccessRequestInput): string {
  const serialized = JSON.stringify({
    principal: context.principal,
    credentialId: input.credentialId,
    operation: input.operation,
    targetUrl: input.targetUrl,
    headers: input.headers ?? {},
    payload: input.payload ?? "",
  });
  return createHash("sha256").update(serialized).digest("hex");
}
