import { safeStorage } from "electron";
import type { DeviceIdentity } from "@tau/collaboration";
import type { CollaborationLocalStore } from "./local-store";

export class CollaborationClient {
  readonly identities = new Map<string, DeviceIdentity>();
  private pendingIdentities = new Map<string, Promise<DeviceIdentity>>();
  constructor(private store: CollaborationLocalStore) {}
  private get nickname() {
    return this.store.get("nickname", "Tau 用户");
  }
  saveIdentity(url: string, identity: DeviceIdentity) {
    this.store.set(`identity:${url}`, JSON.stringify(identity));
    this.identities.set(url, identity);
  }

  async identity(url: string) {
    let pending = this.pendingIdentities.get(url);
    if (!pending) {
      pending = this.loadIdentity(url).finally(() => this.pendingIdentities.delete(url));
      this.pendingIdentities.set(url, pending);
    }
    return pending;
  }

  private parseIdentity(value: string): DeviceIdentity | null {
    try {
      const parsed = JSON.parse(value) as Partial<DeviceIdentity> | null;
      if (parsed?.id && parsed?.secret) {
        return { id: parsed.id, secret: parsed.secret, nickname: parsed.nickname ?? "" };
      }
    } catch {
      // 非 JSON 说明是旧版 safeStorage 密文，由调用方迁移
    }
    return null;
  }

  private async loadIdentity(url: string) {
    const cached = this.identities.get(url);
    if (cached) return cached;
    const stored = this.store.get<string | null>(`identity:${url}`, null);
    if (stored) {
      const identity = this.parseIdentity(stored);
      if (identity) {
        this.identities.set(url, identity);
        return identity;
      }
      // 旧版用 safeStorage 加密，每次启动都会触发系统钥匙串弹窗，这里仅解密一次并回写明文完成迁移
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const migrated = this.parseIdentity(
            safeStorage.decryptString(Buffer.from(stored, "base64"))
          );
          if (migrated) {
            this.saveIdentity(url, migrated);
            return migrated;
          }
        } catch {
          // 用户拒绝钥匙串授权等导致解密失败，放弃旧身份走重新注册
        }
      }
      this.store.delete(`identity:${url}`);
    }
    const response = await fetch(`${url}/v1/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: this.nickname }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("无法创建协作身份，请检查服务器地址或稍后重试");
    const identity = (await response.json()) as DeviceIdentity;
    this.saveIdentity(url, identity);
    return identity;
  }

  async request<T = unknown>(
    url: string,
    path: string,
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const identity = await this.identity(url);
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${identity.id}:${identity.secret}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const details =
        result && typeof result === "object" ? (result as Record<string, unknown>) : {};
      const failure = new Error(
        typeof details.message === "string" ? details.message : "协作请求失败"
      ) as Error & {
        status: number;
        code: string;
      };
      failure.status = response.status;
      failure.code = String(details.code || "REQUEST_FAILED");
      throw failure;
    }
    return result as T;
  }
}
