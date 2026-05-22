import { net } from "electron";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_TIMEOUT_MS = 30_000;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
]);

function isPrivateIP(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(normalized) || normalized.endsWith(".localhost")) {
    return true;
  }

  // IPv4 private ranges
  const ipv4Match = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local
    if (a === 127) return true; // loopback
    if (a === 0) return true;
  }

  return false;
}

function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked scheme: ${parsed.protocol}`);
  }

  if (isPrivateIP(parsed.hostname)) {
    throw new Error(`Blocked host: ${parsed.hostname}`);
  }
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export function safeFetchHtml(
  url: string,
  options: SafeFetchOptions = {},
): Promise<string> {
  const {
    method = "GET",
    accept = "text/html,application/xhtml+xml,*/*",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
  } = options;

  try {
    validateUrl(url);
  } catch (e) {
    return Promise.reject(e);
  }

  return new Promise((resolve, reject) => {
    const request = net.request({
      method,
      url,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
      },
    });

    let body = "";
    let byteCount = 0;
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        request.abort();
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    request.on("response", (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        done = true;
        clearTimeout(timer);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      // Block redirects to private IPs
      const location = response.headers["location"];
      if (location) {
        const redirectUrl = Array.isArray(location) ? location[0] : location;
        try {
          validateUrl(redirectUrl);
        } catch (e) {
          done = true;
          clearTimeout(timer);
          reject(e);
          return;
        }
      }

      response.on("data", (chunk) => {
        if (done) return;
        byteCount += chunk.length;
        if (byteCount > maxBytes) {
          done = true;
          clearTimeout(timer);
          request.abort();
          reject(new Error(`Response exceeded ${maxBytes} bytes limit`));
          return;
        }
        body += chunk.toString();
      });

      response.on("end", () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(body);
      });

      response.on("error", (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });

    request.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });

    request.end();
  });
}

export function safeFetchHead(url: string): Promise<boolean> {
  validateUrl(url);

  return new Promise((resolve) => {
    const request = net.request({
      method: "HEAD",
      url,
      headers: { "User-Agent": USER_AGENT },
    });

    const timer = setTimeout(() => {
      request.abort();
      resolve(false);
    }, 10_000);

    request.on("response", (response) => {
      clearTimeout(timer);
      resolve(
        !!response.statusCode &&
          response.statusCode >= 200 &&
          response.statusCode < 400,
      );
    });

    request.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

    request.end();
  });
}
