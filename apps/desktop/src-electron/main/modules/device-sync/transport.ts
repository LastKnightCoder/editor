import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";
import { request } from "node:https";
import { checkServerIdentity } from "node:tls";
import { X509Certificate } from "node:crypto";
import { DEVICE_SYNC_PROTOCOL } from "@tau/collaboration/src/device-sync/protocol";

export interface DeviceEndpoint {
  addresses: string[];
  port: number;
  certificate: string;
}
export interface DevicePairCode extends DeviceEndpoint {
  protocol: number;
  secret: string;
  library: string;
  expires: number;
}
export interface DevicePeer extends DeviceEndpoint {
  database: string;
  library: string;
  node: string;
  token: string;
}
const MAX_BYTES = 64 * 1024 * 1024;
const privateAddress = (address: string) => {
  if (!isIPv4(address)) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
};
export function parseDevicePairCode(value: string): DevicePairCode {
  if (value.length > 16 * 1024 || !value.trim().startsWith("tau-pair:v1:"))
    throw new Error("DEVICE_SYNC_PAIR: 配对信息格式无效");
  let code: DevicePairCode;
  try {
    code = JSON.parse(Buffer.from(value.trim().slice(12), "base64url").toString());
  } catch {
    throw new Error("DEVICE_SYNC_PAIR: 配对信息格式无效");
  }
  const now = Date.now();
  if (code && typeof code.protocol === "number" && code.protocol !== DEVICE_SYNC_PROTOCOL)
    throw new Error("DEVICE_SYNC_VERSION: 请将配对设备更新到支持稳定身份归并的版本");
  if (
    !code ||
    code.protocol !== DEVICE_SYNC_PROTOCOL ||
    !Number.isSafeInteger(code.expires) ||
    code.expires < now ||
    code.expires > now + 6 * 60_000 ||
    typeof code.secret !== "string" ||
    code.secret.length < 40 ||
    typeof code.library !== "string" ||
    !code.library.length ||
    code.library.length > 256
  )
    throw new Error("DEVICE_SYNC_PAIR_EXPIRED: 请在协调电脑重新生成配对信息");
  return code;
}
export async function requestDevice<T>(
  endpoint: DeviceEndpoint,
  body: unknown,
  token?: string,
  signal?: AbortSignal
): Promise<T> {
  if (
    !Array.isArray(endpoint.addresses) ||
    !endpoint.addresses.length ||
    endpoint.addresses.length > 16 ||
    !Number.isInteger(endpoint.port) ||
    endpoint.port <= 0 ||
    endpoint.port > 65535 ||
    typeof endpoint.certificate !== "string" ||
    endpoint.certificate.length > 8192
  )
    throw new Error("DEVICE_SYNC_ADDRESS: 配对地址无效");
  const certificate = new X509Certificate(endpoint.certificate);
  if (!certificate.checkHost("tau-device.local"))
    throw new Error("DEVICE_SYNC_CERTIFICATE: 配对证书无效");
  const bytes = Buffer.from(JSON.stringify(body));
  if (bytes.length > MAX_BYTES) throw new Error("DEVICE_SYNC_BUDGET: 请求超过当前传输预算");
  const timeout = AbortSignal.timeout(30_000);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (const address of endpoint.addresses) {
    abort.throwIfAborted();
    let candidates: string[];
    if (privateAddress(address)) candidates = [address];
    else {
      if (typeof address !== "string" || !/^[a-zA-Z0-9-]{1,63}(\.local)?$/.test(address))
        throw new Error("DEVICE_SYNC_ADDRESS: 仅接受局域网地址与本机主机名");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        candidates = (
          await Promise.race([
            lookup(address, { family: 4, all: true }),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("解析超时")), 3000);
            }),
          ])
        )
          .map(entry => entry.address)
          .filter(privateAddress);
      } catch {
        candidates = [];
      } finally {
        clearTimeout(timer);
      }
    }
    for (const ip of candidates) {
      abort.throwIfAborted();
      try {
        return await new Promise<T>((resolve, reject) => {
          const outgoing = request(
            {
              hostname: ip,
              port: endpoint.port,
              path: "/device-sync/v1",
              method: "POST",
              servername: "tau-device.local",
              ca: endpoint.certificate,
              rejectUnauthorized: true,
              agent: false,
              signal: abort,
              checkServerIdentity: (_, peer) =>
                !peer.raw?.equals(certificate.raw)
                  ? new Error("DEVICE_SYNC_CERTIFICATE: 配对证书不符")
                  : checkServerIdentity("tau-device.local", peer),
              headers: {
                "Content-Type": "application/json",
                "Content-Length": bytes.length,
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            },
            incoming => {
              const chunks: Buffer[] = [];
              let size = 0;
              incoming.on("error", reject);
              incoming.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_BYTES)
                  incoming.destroy(new Error("DEVICE_SYNC_BUDGET: 响应超过当前传输预算"));
                else chunks.push(chunk);
              });
              incoming.on("end", () => {
                try {
                  const result = JSON.parse(Buffer.concat(chunks).toString());
                  if (incoming.statusCode !== 200)
                    throw new Error(
                      typeof result.error === "string"
                        ? result.error
                        : "DEVICE_SYNC_RESPONSE: 同步响应无效"
                    );
                  resolve(result);
                } catch (error) {
                  reject(error);
                }
              });
            }
          );
          outgoing.on("socket", socket => {
            socket.setTimeout(3000, () => outgoing.destroy(new Error("连接超时")));
            socket.once("secureConnect", () => outgoing.setTimeout(30_000));
          });
          outgoing.on("response", () => outgoing.setTimeout(30_000));
          outgoing.on("error", reject);
          outgoing.end(bytes);
        });
      } catch (error) {
        if (/DEVICE_SYNC_(?!CERTIFICATE)/.test(String(error))) throw error;
      }
    }
  }
  throw new Error("DEVICE_SYNC_OFFLINE: 协调电脑离线、局域网权限未开启或证书校验失败");
}
