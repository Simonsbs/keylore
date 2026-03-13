import { CredentialRecord, PolicyFile, PolicyRule, PrincipalRole } from "../domain/types.js";

export interface PolicyDecision {
  decision: "allow" | "deny" | "approval";
  reason: string;
  ruleId: string | undefined;
}

function matchPattern(value: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }

  const normalizedValue = value.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  if (normalizedPattern.startsWith("*.")) {
    return (
      normalizedValue === normalizedPattern.slice(2) ||
      normalizedValue.endsWith(normalizedPattern.slice(1))
    );
  }

  return normalizedValue === normalizedPattern;
}

function ruleMatches(
  rule: PolicyRule,
  principal: string,
  roles: PrincipalRole[],
  credential: CredentialRecord,
  operation: string,
  host: string,
  environment: string,
): boolean {
  const principalMatch = rule.principals.some((candidate) => matchPattern(principal, candidate));
  const roleMatch =
    !rule.principalRoles ||
    rule.principalRoles.some((requiredRole) => roles.includes(requiredRole));
  const credentialMatch =
    !rule.credentialIds || rule.credentialIds.some((candidate) => candidate === credential.id);
  const serviceMatch =
    !rule.services || rule.services.some((candidate) => matchPattern(credential.service, candidate));
  const operationMatch = rule.operations.some((candidate) => matchPattern(operation, candidate));
  const domainMatch = rule.domainPatterns.some((candidate) => matchPattern(host, candidate));
  const environmentMatch =
    !rule.environments ||
    rule.environments.some((candidate) => matchPattern(environment, candidate));

  return (
    principalMatch &&
    roleMatch &&
    credentialMatch &&
    serviceMatch &&
    operationMatch &&
    domainMatch &&
    environmentMatch
  );
}

export class PolicyEngine {
  public evaluate(
    policies: PolicyFile,
    principal: string,
    roles: PrincipalRole[],
    credential: CredentialRecord,
    operation: string,
    host: string,
    environment: string,
  ): PolicyDecision {
    if (credential.status !== "active") {
      return { decision: "deny", reason: "Credential is not active.", ruleId: undefined };
    }

    if (
      credential.expiresAt &&
      new Date(credential.expiresAt).getTime() <= Date.now()
    ) {
      return { decision: "deny", reason: "Credential has expired.", ruleId: undefined };
    }

    if (!credential.permittedOperations.includes(operation as "http.get" | "http.post")) {
      return {
        decision: "deny",
        reason: "Operation is not permitted for this credential.",
        ruleId: undefined,
      };
    }

    if (!credential.allowedDomains.some((domain) => matchPattern(host, domain))) {
      return {
        decision: "deny",
        reason: "Target domain is not allowlisted for this credential.",
        ruleId: undefined,
      };
    }

    const matchingRules = policies.rules.filter((rule) =>
      ruleMatches(rule, principal, roles, credential, operation, host, environment),
    );

    const denyRule = matchingRules.find((rule) => rule.effect === "deny");
    if (denyRule) {
      return {
        decision: "deny",
        reason: denyRule.description,
        ruleId: denyRule.id,
      };
    }

    const approvalRule = matchingRules.find((rule) => rule.effect === "approval");
    if (approvalRule) {
      return {
        decision: "approval",
        reason: approvalRule.description,
        ruleId: approvalRule.id,
      };
    }

    const allowRule = matchingRules.find((rule) => rule.effect === "allow");
    if (allowRule) {
      return {
        decision: "allow",
        reason: allowRule.description,
        ruleId: allowRule.id,
      };
    }

    return {
      decision: "deny",
      reason: "No matching allow rule was found. KeyLore is default-deny.",
      ruleId: undefined,
    };
  }
}
