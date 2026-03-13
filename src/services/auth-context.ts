import { AuthContext, authContextSchema, AccessScope, PrincipalRole } from "../domain/types.js";

const allScopes: AccessScope[] = [
  "catalog:read",
  "catalog:write",
  "admin:read",
  "broker:use",
  "audit:read",
  "approval:read",
  "approval:review",
  "mcp:use",
];

const localRoles: PrincipalRole[] = ["admin", "operator", "auditor", "approver"];

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
