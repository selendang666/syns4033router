import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for user-supplied URLs (provider baseUrl validation, the health
 * scanner). These handlers fetch whatever the caller names and report the
 * result, so without this they can be pointed at 127.0.0.1, the LAN, or the
 * 169.254.169.254 metadata endpoint and used as an internal port scanner.
 *
 * The check is on the RESOLVED address, not the hostname string: a public
 * hostname can still resolve to a private IP, and a literal IP can hide behind
 * a decimal or IPv6 form. Scheme is restricted so file:// and friends cannot
 * reach the filesystem.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Ranges that must never be reachable from a user-supplied URL.
const BLOCKED_V4 = [
  ["0.0.0.0", 8],        // this network
  ["10.0.0.0", 8],       // private
  ["100.64.0.0", 10],    // carrier NAT
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local, incl. cloud metadata
  ["172.16.0.0", 12],    // private
  ["192.0.0.0", 24],     // IETF protocol assignments
  ["192.168.0.0", 16],   // private
  ["198.18.0.0", 15],    // benchmarking
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved
];

function v4ToInt(ip) {
  return ip.split(".").reduce((acc, o) => ((acc << 8) + Number(o)) >>> 0, 0);
}

function inV4Range(ip, cidr) {
  const [base, bits] = cidr;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

export function isBlockedAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) return BLOCKED_V4.some((r) => inV4Range(ip, r));
  if (v !== 6) return true; // not an IP we understand — refuse

  const addr = ip.toLowerCase().split("%")[0]; // drop zone id
  // ::ffff:a.b.c.d — IPv4-mapped, must be judged as IPv4.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  if (addr === "::1" || addr === "::") return true;
  // fc00::/7 unique-local, fe80::/10 link-local
  if (/^f[cd]/.test(addr)) return true;
  if (/^fe[89ab]/.test(addr)) return true;
  return false;
}

/**
 * Resolve `rawUrl` and return the reason it is refused, or null when it is safe
 * to fetch. Callers should treat any string as a rejection.
 */
export async function findSsrfReason(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "invalid URL";
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return `protocol not allowed: ${url.protocol}`;
  }
  // Credentials in the authority are a classic way to smuggle a different host
  // past a naive parser.
  if (url.username || url.password) return "credentials in URL not allowed";

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    return isBlockedAddress(host) ? `address not allowed: ${host}` : null;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return `cannot resolve host: ${host}`;
  }
  if (!records.length) return `cannot resolve host: ${host}`;
  for (const r of records) {
    if (isBlockedAddress(r.address)) {
      return `${host} resolves to a non-public address (${r.address})`;
    }
  }
  return null;
}
