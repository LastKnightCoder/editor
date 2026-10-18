import { createHmac } from "node:crypto";
import type { IncomingMessage } from "node:http";

/** 测试服务独立核验OSS V1的请求头签名与签名URL。 */
export function verifyOssSignature(request: IncomingMessage, bucket: string, secret: string) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const signature =
    url.searchParams.get("Signature") ??
    /^OSS [^:]+:(.+)$/.exec(request.headers.authorization ?? "")?.[1];
  if (!signature) return false;
  const expires = url.searchParams.get("Expires");
  if (expires && Number(expires) < Date.now() / 1000) return false;
  const ossHeaders = Object.keys(request.headers)
    .filter(key => key.startsWith("x-oss-"))
    .sort()
    .map(key => key + ":" + String(request.headers[key]).trim());
  const resource =
    "/" +
    bucket +
    decodeURIComponent(url.pathname) +
    (url.searchParams.has("versioning") ? "?versioning" : "");
  const canonical = [
    request.method,
    request.headers["content-md5"] ?? "",
    request.headers["content-type"] ?? "",
    expires ?? request.headers["x-oss-date"] ?? "",
    ...ossHeaders,
    resource,
  ].join("\n");
  return createHmac("sha1", secret).update(canonical).digest("base64") === signature;
}
