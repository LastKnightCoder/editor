import { createHash, createHmac } from "node:crypto";
import type { IncomingMessage } from "node:http";

/** 测试服务独立核验SigV4，确保浏览器与宿主传输未改变签名字段。 */
export function verifySignature(request: IncomingMessage, secret: string): boolean {
  const authorization = request.headers.authorization ?? "";
  const match =
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]+)$/.exec(
      authorization
    );
  if (!match) return false;
  const [, , scope, signedHeaders, signature] = match;
  const [date, region, service, suffix] = scope.split("/");
  if (suffix !== "aws4_request") return false;
  const url = new URL(request.url ?? "/", "http://localhost");
  const encode = (value: string) =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      char => "%" + char.charCodeAt(0).toString(16).toUpperCase()
    );
  const query = [...url.searchParams]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([key, value]) => key + "=" + value)
    .join("&");
  const headers = signedHeaders
    .split(";")
    .map(
      name =>
        name +
        ":" +
        String(request.headers[name] ?? "")
          .trim()
          .replace(/\s+/g, " ") +
        "\n"
    )
    .join("");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const canonical = [
    request.method,
    url.pathname,
    query,
    headers,
    signedHeaders,
    request.headers["x-amz-content-sha256"] ?? hash(""),
  ].join("\n");
  const text = ["AWS4-HMAC-SHA256", request.headers["x-amz-date"], scope, hash(canonical)].join(
    "\n"
  );
  let key: Buffer = Buffer.from("AWS4" + secret);
  for (const value of [date, region, service, suffix])
    key = createHmac("sha256", key).update(value).digest();
  const valid = createHmac("sha256", key).update(text).digest("hex") === signature;
  return valid;
}
