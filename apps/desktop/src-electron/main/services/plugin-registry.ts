import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validatePluginManifest } from "@tau/plugins/host";
import type {
  DevelopmentPluginRecord,
  RestoredDevelopmentPlugin,
} from "@/types/plugin-development";
import { readDevelopmentPlugin } from "./plugin-package";

interface Workspace {
  name: string;
  id: string;
  plugins: DevelopmentPluginRecord[];
}
interface Registry {
  version: 1;
  workspaces: Workspace[];
}

export function pluginWorkspaceName(value: string): string {
  if (typeof value !== "string" || !value.trim() || /[/\\\0]/.test(value))
    throw new Error("插件工作区名称无效");
  const name = value.endsWith(".db") ? value.slice(0, -3) : value;
  if (!name.trim()) throw new Error("插件工作区名称无效");
  return name;
}

function parseRegistry(raw: string): Registry {
  const value = JSON.parse(raw) as Registry;
  if (value?.version !== 1 || !Array.isArray(value.workspaces))
    throw new Error("插件登记文件格式无效");
  const names = new Set<string>();
  const identities = new Set<string>();
  for (const workspace of value.workspaces) {
    if (
      !workspace ||
      pluginWorkspaceName(workspace.name) !== workspace.name ||
      typeof workspace.id !== "string" ||
      !workspace.id ||
      identities.has(workspace.id) ||
      names.has(workspace.name) ||
      !Array.isArray(workspace.plugins)
    )
      throw new Error("插件工作区记录无效");
    names.add(workspace.name);
    identities.add(workspace.id);
    const ids = new Set<string>();
    for (const record of workspace.plugins) {
      record.manifest = validatePluginManifest(record.manifest);
      if (
        typeof record.directory !== "string" ||
        !path.isAbsolute(record.directory) ||
        typeof record.enabled !== "boolean" ||
        typeof record.starting !== "boolean" ||
        ids.has(record.manifest.id)
      )
        throw new Error("插件登记记录无效");
      ids.add(record.manifest.id);
    }
  }
  return value;
}

/** 主进程单实例串行读改写；写入失败不发布新快照。 */
export class DevelopmentPluginRegistry {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly filename: string) {}

  private transact<T>(operation: (registry: Registry) => T, save = true): Promise<T> {
    const result = this.pending.then(async () => {
      let registry: Registry;
      try {
        registry = parseRegistry(await readFile(this.filename, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        registry = { version: 1, workspaces: [] };
      }
      const value = operation(registry);
      if (!save) return structuredClone(value);
      await mkdir(path.dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(registry), { flag: "wx", mode: 0o600 });
        await rename(temporary, this.filename);
      } finally {
        await rm(temporary, { force: true });
      }
      return structuredClone(value);
    });
    this.pending = result.catch(() => undefined);
    return result;
  }

  open(name: string) {
    const normalized = pluginWorkspaceName(name);
    return this.transact(registry => {
      let workspace = registry.workspaces.find(item => item.name === normalized);
      if (!workspace) {
        workspace = { name: normalized, id: randomUUID(), plugins: [] };
        registry.workspaces.push(workspace);
      }
      return workspace;
    });
  }

  add(workspaceId: string, record: DevelopmentPluginRecord) {
    return this.transact(registry => {
      const workspace = this.workspace(registry, workspaceId);
      if (workspace.plugins.some(item => item.manifest.id === record.manifest.id))
        throw new Error("插件已注册");
      const snapshot = {
        ...record,
        manifest: validatePluginManifest(record.manifest),
        enabled: false,
        starting: false,
      };
      workspace.plugins.push(snapshot);
      return snapshot;
    });
  }

  state(workspaceId: string, id: string, enabled: boolean, starting: boolean) {
    return this.transact(registry => {
      const record = this.workspace(registry, workspaceId).plugins.find(
        item => item.manifest.id === id
      );
      if (!record) throw new Error("插件登记已不存在");
      record.enabled = enabled;
      record.starting = starting;
    });
  }

  remove(workspaceId: string, id: string) {
    return this.transact(registry => {
      const workspace = this.workspace(registry, workspaceId);
      workspace.plugins = workspace.plugins.filter(item => item.manifest.id !== id);
    });
  }

  get(workspaceId: string, id: string) {
    return this.transact(registry => {
      const record = this.workspace(registry, workspaceId).plugins.find(
        item => item.manifest.id === id
      );
      if (!record) throw new Error("插件登记已不存在");
      return record;
    }, false);
  }

  replace(workspaceId: string, record: DevelopmentPluginRecord) {
    return this.transact(registry => {
      const workspace = this.workspace(registry, workspaceId);
      const index = workspace.plugins.findIndex(item => item.manifest.id === record.manifest.id);
      if (index < 0) throw new Error("插件登记已不存在");
      workspace.plugins[index] = {
        manifest: validatePluginManifest(record.manifest),
        directory: record.directory,
        enabled: record.enabled,
        starting: record.starting,
      };
    });
  }

  retire(name: string) {
    return this.transact(registry => {
      registry.workspaces = registry.workspaces.filter(
        item => item.name !== pluginWorkspaceName(name)
      );
    });
  }

  private workspace(registry: Registry, id: string) {
    const workspace = registry.workspaces.find(item => item.id === id);
    if (!workspace) throw new Error("插件工作区已失效");
    return workspace;
  }
}

export async function restoreDevelopmentPlugin(
  record: DevelopmentPluginRecord
): Promise<RestoredDevelopmentPlugin> {
  try {
    const artifact = await readDevelopmentPlugin(record.directory);
    if (
      JSON.stringify(artifact.manifest) !== JSON.stringify(validatePluginManifest(record.manifest))
    )
      throw new Error("插件产物已变化，请移除登记后重新选择完整构建");
    return { ...record, artifact };
  } catch (error) {
    return { ...record, error: error instanceof Error ? error.message : "插件读取失败" };
  }
}
