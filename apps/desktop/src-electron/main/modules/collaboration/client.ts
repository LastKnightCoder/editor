import { DEFAULT_COLLABORATION_URL, type DeviceIdentity } from "@tau/collaboration";
import { createHash } from "node:crypto";
import type { CollaborationLocalStore } from "./local-store";

export class CollaborationClient {
  readonly identities = new Map<string, DeviceIdentity>();
  private pendingIdentities = new Map<string, Promise<DeviceIdentity>>();
  private aliases = new Map<string, string>();
  private originHashes = new Set<string>();
  private migrationEnabled = false;
  private migrationComplete = false;
  private migrationPending: Promise<void> | null = null;
  private readonly responseDates = new Map<string, number>();
  constructor(private store: CollaborationLocalStore) {}
  private get nickname() {
    return this.store.get("nickname", "Tau 用户");
  }
  saveIdentity(url: string, identity: DeviceIdentity) {
    this.store.set(`identity:${url}`, JSON.stringify(identity));
    this.identities.set(url, identity);
  }

  canonicalUrl(url: string) {
    return (
      this.aliases.get(url) ??
      (this.originHashes.has(createHash("sha256").update(url).digest("hex"))
        ? DEFAULT_COLLABORATION_URL
        : url)
    );
  }

  serverTime(url: string): number {
    const time = this.responseDates.get(this.canonicalUrl(url));
    if (time === undefined) throw new Error("协作响应缺少有效 Date，未提交本机编辑，请稍后重试");
    return time;
  }

  async migrateOfficialEndpoint(deferNetwork = false) {
    this.migrationEnabled = true;
    if (deferNetwork && !this.store.get("endpoint-aliases", null)) return;
    this.migrationPending ??= this.runEndpointMigration().finally(() => {
      this.migrationPending = null;
    });
    return this.migrationPending;
  }

  private async runEndpointMigration() {
    const canonical = DEFAULT_COLLABORATION_URL;
    const saved = this.store.get<{
      canonical: string;
      origins: string[];
      hashes?: string[];
    } | null>("endpoint-aliases", null);
    if (saved?.canonical === canonical) {
      this.aliases = new Map(saved.origins.map(origin => [origin, canonical]));
      this.originHashes = new Set(saved.hashes ?? []);
      this.migrationComplete = true;
      return;
    }
    const response = await fetch(canonical + "/health/ready", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("协作服务升级检查失败，请稍后重试");
    const info = (await response.json()) as {
      canonicalUrl?: string;
      legacyOriginHashes?: string[];
    };
    if (info.canonicalUrl !== canonical || !Array.isArray(info.legacyOriginHashes)) return;
    const hashes = new Set(info.legacyOriginHashes.filter(value => /^[a-f0-9]{64}$/.test(value)));
    const legacy = this.store.identityEntries().flatMap(([origin, value]) => {
      if (origin === canonical || !hashes.has(createHash("sha256").update(origin).digest("hex")))
        return [];
      const identity = this.parseIdentity(value);
      return identity ? [{ origin, identity }] : [];
    });
    const existing = this.store.get<string | null>("identity:" + canonical, null);
    const target = (existing ? this.parseIdentity(existing) : null) ?? legacy[0]?.identity;
    if (target) {
      for (const { identity } of legacy) {
        if (identity.id === target.id) continue;
        const merged = await fetch(canonical + "/v1/devices/merge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + target.id + ":" + target.secret,
          },
          body: JSON.stringify({ sourceId: identity.id, sourceSecret: identity.secret }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!merged.ok) throw new Error("协作身份升级失败，已保留原身份，请稍后重试");
      }
      this.saveIdentity(canonical, target);
    }
    const origins = legacy.map(item => item.origin);
    this.store.set("endpoint-aliases", { canonical, origins, hashes: [...hashes] });
    this.originHashes = hashes;
    this.aliases = new Map(origins.map(origin => [origin, canonical]));
    this.migrationComplete = true;
  }

  async identity(url: string) {
    if (this.migrationEnabled && !this.migrationComplete && url === DEFAULT_COLLABORATION_URL)
      await this.migrateOfficialEndpoint();
    url = this.canonicalUrl(url);
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
      // 非 JSON 值视为无效身份
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
    body?: unknown,
    protocolVersion?: number
  ): Promise<T> {
    url = this.canonicalUrl(url);
    const identity = await this.identity(url);
    url = this.canonicalUrl(url);
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${identity.id}:${identity.secret}`,
        ...(protocolVersion === undefined
          ? {}
          : { "x-tau-document-version": String(protocolVersion) }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const time = Date.parse(response.headers.get("date") ?? "");
    if (Number.isFinite(time)) this.responseDates.set(url, time);
    else this.responseDates.delete(url);
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
