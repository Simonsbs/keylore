import { AuthContext, authContextSchema, AccessScope, PrincipalRole } from "../domain/types.js";

const allScopes: AccessScope[] = [
  "catalog:read",
  "catalog:write",
  "admin:read",
  "admin:write",
  "auth:read",
  "auth:write",
  "broker:use",
  "sandbox:run",
  "audit:read",
  "approval:read",
  "approval:review",
  "system:read",
  "system:write",
  "backup:read",
  "backup:write",
  "breakglass:request",
  "breakglass:read",
  "breakglass:review",
  "mcp:use",
];

const localRoles: PrincipalRole[] = [
  "admin",
  "auth_admin",
  "operator",
  "maintenance_operator",
  "backup_operator",
  "breakglass_operator",
  "auditor",
  "approver",
];

export function localOperatorContext(principal: string): AuthContext {
  return authContextSchema.parse({
    principal,
    clientId: "local-cli",
    roles: localRoles,
    scopes: allScopes,
  });
}

export function authContextFromToken(auth: {
  principal: string;
  clientId: string;
  roles: PrincipalRole[];
  scopes: AccessScope[];
  resource?: string;
}): AuthContext {
  return authContextSchema.parse(auth);
}
