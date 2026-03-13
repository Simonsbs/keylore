import dns from "node:dns/promises";
import net from "node:net";

import { KeyLoreConfig } from "../config.js";

function matchPattern(value: string, pattern: string): boolean {
  const normalizedValue = value.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  if (normalizedPattern === "*") {
    return true;
  }

  if (normalizedPattern.startsWith("*.")) {
    return (
      normalizedValue === normalizedPattern.slice(2) ||
      normalizedValue.endsWith(normalizedPattern.slice(1))
    );
  }

  return normalizedValue === normalizedPattern;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost";
}

function isLoopbackIp(ip: string): boolean {
  return ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.");
}

function isBlockedIpv4(ip: string): boolean {
  const octets = ip.split(".").map((value) => Number.parseInt(value, 10));
  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return true;
  }

  const [a, b, c] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 0) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 192 && b === 0 && c === 2) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19 || b === 51) && c === 100) {
    return true;
  }
  if (a === 203 && b === 0 && c === 113) {
    return true;
  }
  return a >= 224;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:172.16.") ||
    normalized.startsWith("::ffff:172.17.") ||
    normalized.startsWith("::ffff:172.18.") ||
    normalized.startsWith("::ffff:172.19.") ||
    normalized.startsWith("::ffff:172.2") ||
    normalized.startsWith("::ffff:169.254.")
  );
}

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isBlockedIpv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isBlockedIpv6(ip);
  }
  return true;
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

export async function validateEgressTarget(
  rawUrl: string,
  config: KeyLoreConfig,
): Promise<URL> {
  const targetUrl = new URL(rawUrl);
  const hostname = targetUrl.hostname;
  const hostAllowlisted = config.egressAllowedHosts.some((pattern) => matchPattern(hostname, pattern));
  const isLoopbackHost = isLoopbackHostname(hostname);
  const isLoopbackHttp = targetUrl.protocol === "http:" && isLoopbackHost;

  if (targetUrl.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error("Only HTTPS targets are allowed, except localhost for local development.");
  }

  if (
    targetUrl.protocol === "https:" &&
    targetUrl.port.length > 0 &&
    !config.egressAllowedHttpsPorts.includes(Number.parseInt(targetUrl.port, 10)) &&
    !hostAllowlisted
  ) {
    throw new Error("HTTPS target port is not allowlisted by egress policy.");
  }

  if (config.egressAllowPrivateIps || hostAllowlisted || isLoopbackHost) {
    return targetUrl;
  }

  const addresses =
    net.isIP(hostname) > 0
      ? [hostname]
      : await resolveAddresses(hostname);

  if (addresses.some((address) => isLoopbackIp(address) || isBlockedIp(address))) {
    throw new Error("Target resolves to a blocked private, loopback, or link-local address.");
  }

  return targetUrl;
}
