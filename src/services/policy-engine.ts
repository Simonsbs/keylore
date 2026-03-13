import { CredentialRecord, PolicyFile, PolicyRule } from "../domain/types.js";

export interface PolicyDecision {
  allowed: boolean;
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
  credential: CredentialRecord,
  operation: string,
  host: string,
  environment: string,
): boolean {
  const principalMatch = rule.principals.some((candidate) => matchPattern(principal, candidate));
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
    credential: CredentialRecord,
    operation: string,
    host: string,
    environment: string,
  ): PolicyDecision {
    if (credential.status !== "active") {
      return { allowed: false, reason: "Credential is not active.", ruleId: undefined };
    }

    if (
      credential.expiresAt &&
      new Date(credential.expiresAt).getTime() <= Date.now()
    ) {
      return { allowed: false, reason: "Credential has expired.", ruleId: undefined };
    }

    if (!credential.permittedOperations.includes(operation as "http.get" | "http.post")) {
      return {
        allowed: false,
        reason: "Operation is not permitted for this credential.",
        ruleId: undefined,
      };
    }

    if (!credential.allowedDomains.some((domain) => matchPattern(host, domain))) {
      return {
        allowed: false,
        reason: "Target domain is not allowlisted for this credential.",
        ruleId: undefined,
      };
    }

    const matchingRules = policies.rules.filter((rule) =>
      ruleMatches(rule, principal, credential, operation, host, environment),
    );

    const denyRule = matchingRules.find((rule) => rule.effect === "deny");
    if (denyRule) {
      return {
        allowed: false,
        reason: denyRule.description,
        ruleId: denyRule.id,
      };
    }

    const allowRule = matchingRules.find((rule) => rule.effect === "allow");
    if (allowRule) {
      return {
        allowed: true,
        reason: allowRule.description,
        ruleId: allowRule.id,
      };
    }

    return {
      allowed: false,
      reason: "No matching allow rule was found. KeyLore is default-deny.",
      ruleId: undefined,
    };
  }
}
