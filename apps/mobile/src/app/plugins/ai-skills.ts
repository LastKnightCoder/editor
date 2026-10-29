import { invoke } from "@tauri-apps/api/core";
import { AiError } from "@tau/ai/contracts";
import type { AiSkillSource } from "@tau/ai/skills";

export interface MobileAiSkillPackage {
  kind: "plugin" | "skills";
  id: string;
  version: string;
  skillRevision: string;
}
interface NativeSource {
  kind: "plugin" | "skills";
  pluginId: string;
  pluginName: string;
  version: string;
  revision: string;
  entries: { id: string; path: string }[];
}
interface Registration {
  package: MobileAiSkillPackage;
  source: AiSkillSource;
  unregister: () => void;
  gate: { active: boolean };
}
export interface MobilePluginAiSkillOptions {
  getActivePackages(): readonly MobileAiSkillPackage[];
  subscribe(listener: () => void): () => void;
  registerSource(source: AiSkillSource): (() => void) | Promise<() => void>;
  onError?(error: Error): void;
}
export interface MobilePluginAiSkillSnapshot {
  revision: number;
  pending: boolean;
  error: Error | null;
  sourceIds: readonly string[];
}
const MAX_RESOURCE_BYTES = 256 * 1024;
const unavailable = (message: string) => new AiError("AI_SKILL_UNAVAILABLE", message);
async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (error instanceof Error) throw error;
    const message = String(error);
    throw new AiError(
      message.startsWith("AI_SKILL_INVALID:") ? "AI_SKILL_INVALID" : "AI_SKILL_UNAVAILABLE",
      message
    );
  }
}
const key = (value: MobileAiSkillPackage) =>
  JSON.stringify([value.id, value.kind, value.version, value.skillRevision]);

/** 插件来源只读已验证安装包；停用与工作区释放立即撤销读取资格。 */
export function createMobilePluginAiSkills(
  database: string,
  token: string,
  options: MobilePluginAiSkillOptions
) {
  const registrations = new Map<string, Registration>();
  const listeners = new Set<() => void>();
  let disposed = false;
  let epoch = 0;
  let queue = Promise.resolve();
  let pending = 0;
  let disposal: Promise<void> | undefined;
  let activeSignature = "";
  let cleanupIssue: Error | null = null;
  let snapshot: MobilePluginAiSkillSnapshot = {
    revision: 0,
    pending: false,
    error: null,
    sourceIds: [],
  };
  const update = (error = snapshot.error) => {
    snapshot = Object.freeze({
      revision: snapshot.revision + 1,
      pending: pending > 0,
      error: error ?? cleanupIssue,
      sourceIds: Object.freeze([...registrations.keys()]),
    });
    for (const listener of listeners) {
      try {
        listener();
      } catch (issue) {
        console.warn("插件技能来源订阅失败", issue);
      }
    }
  };
  const matches = (value: MobileAiSkillPackage) =>
    !disposed && options.getActivePackages().some(current => key(current) === key(value));
  const revoke = (id: string) => {
    const registration = registrations.get(id);
    if (!registration) return;
    registration.gate.active = false;
    registrations.delete(id);
    try {
      registration.unregister();
    } catch (error) {
      const issue = error instanceof Error ? error : unavailable(String(error));
      cleanupIssue = issue;
      update(issue);
      console.warn("插件技能来源撤销失败", issue);
    }
  };
  const revokeInactive = () => {
    for (const [id, registration] of registrations) if (!matches(registration.package)) revoke(id);
  };
  const revokeAll = () => {
    for (const id of [...registrations.keys()]) revoke(id);
  };
  async function perform(currentEpoch: number) {
    if (disposed || epoch !== currentEpoch) return;
    revokeInactive();
    const packages = options.getActivePackages().map(value => Object.freeze({ ...value }));
    if (!packages.length) {
      revokeAll();
      update(null);
      return;
    }
    const sources: NativeSource[] = [];
    for (let offset = 0; offset < packages.length; offset += 32) {
      if (disposed || epoch !== currentEpoch) return;
      const batch = await call<NativeSource[]>("plugin_ai_skill_sources", {
        database,
        token,
        pluginIds: packages.slice(offset, offset + 32).map(value => value.id),
      });
      if (!Array.isArray(batch)) throw new AiError("AI_SKILL_INVALID", "原生技能目录不是数组");
      sources.push(...batch);
    }
    if (disposed || epoch !== currentEpoch) return;
    const accepted = new Set<string>();
    for (const item of sources) {
      const pkg = packages.find(value => value.id === item.pluginId);
      if (!pkg || !matches(pkg)) continue;
      if (
        item.kind !== pkg.kind ||
        item.version !== pkg.version ||
        item.revision !== pkg.skillRevision
      )
        throw unavailable("技能安装版本与当前活动插件不一致，请重新加载插件");
      if (accepted.has(item.pluginId) || !Array.isArray(item.entries))
        throw new AiError("AI_SKILL_INVALID", "原生技能来源身份重复或目录无效");
      accepted.add(item.pluginId);
      if (registrations.get(item.pluginId)?.source.revision === item.revision) continue;
      revoke(item.pluginId);
      const entries = Object.freeze(
        item.entries.map(entry => {
          if (
            typeof entry.id !== "string" ||
            !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(entry.id) ||
            entry.path !== `skills/${entry.id}/SKILL.md`
          )
            throw new AiError("AI_SKILL_INVALID", "原生技能目录路径无效");
          return Object.freeze({ ...entry });
        })
      );
      const gate = { active: true };
      const check = (signal?: AbortSignal) => {
        signal?.throwIfAborted();
        if (!gate.active || !matches(pkg)) throw unavailable("插件技能来源已停用或工作区已释放");
      };
      const source = Object.freeze<AiSkillSource>({
        id: pkg.id,
        revision: item.revision,
        async list(signal) {
          check(signal);
          return entries;
        },
        async read(path, signal) {
          const decoder = new TextDecoder("utf-8", { fatal: true });
          let offset = 0;
          let text = "";
          for (;;) {
            check(signal);
            const chunk = await call<{ data: string; nextOffset: number; eof: boolean }>(
              "plugin_ai_skill_read",
              { database, token, pluginId: pkg.id, revision: item.revision, path, offset }
            );
            check(signal);
            const bytes = Uint8Array.from(atob(chunk.data), character => character.charCodeAt(0));
            if (
              !Number.isSafeInteger(chunk.nextOffset) ||
              chunk.nextOffset !== offset + bytes.length ||
              chunk.nextOffset > MAX_RESOURCE_BYTES ||
              (!bytes.length && !chunk.eof)
            )
              throw new AiError("AI_SKILL_INVALID", "技能资料分块长度无效或超过读取预算");
            offset = chunk.nextOffset;
            text += decoder.decode(bytes, { stream: !chunk.eof });
            if (chunk.eof) return text;
          }
        },
      });
      let unregister: () => void;
      try {
        unregister = await options.registerSource(source);
      } catch (error) {
        gate.active = false;
        throw error;
      }
      if (typeof unregister !== "function") {
        gate.active = false;
        throw new AiError("AI_SKILL_INVALID", "技能来源注册未返回释放函数");
      }
      const registration: Registration = { package: pkg, source, unregister, gate };
      if (disposed || epoch !== currentEpoch || !matches(pkg)) {
        gate.active = false;
        unregister();
        return;
      }
      registrations.set(pkg.id, registration);
    }
    for (const id of [...registrations.keys()]) if (!accepted.has(id)) revoke(id);
    update(null);
  }
  function refresh(): Promise<void> {
    if (disposed) return Promise.reject(unavailable("插件技能来源已释放"));
    const currentEpoch = ++epoch;
    pending++;
    update();
    const result = queue
      .then(() => perform(currentEpoch))
      .catch(error => {
        revokeAll();
        const issue = error instanceof Error ? error : unavailable(String(error));
        update(issue);
        if (!disposed) {
          if (options.onError) options.onError(issue);
          else console.warn("插件技能来源刷新失败", issue);
        }
        throw issue;
      })
      .finally(() => {
        pending--;
        update();
      });
    queue = result.catch(() => undefined);
    return result;
  }
  const changed = () => {
    if (disposed) return;
    revokeInactive();
    const signature = JSON.stringify(options.getActivePackages().map(key).sort());
    if (signature === activeSignature) return;
    activeSignature = signature;
    void refresh().catch(() => undefined);
  };
  const unsubscribe = options.subscribe(changed);
  changed();
  return {
    refresh,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true;
      epoch++;
      unsubscribe();
      revokeAll();
      update();
      disposal = queue.then(() => {
        update();
        listeners.clear();
      });
      return disposal;
    },
  };
}
