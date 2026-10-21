import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

interface Workspace {
  name: string;
  id: string;
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
      names.has(workspace.name)
    )
      throw new Error("插件工作区记录无效");
    names.add(workspace.name);
    identities.add(workspace.id);
  }
  // 只保留身份字段，下次写入时丢弃旧开发插件登记。
  return { version: 1, workspaces: value.workspaces.map(({ name, id }) => ({ name, id })) };
}

/** 本机规范化库名到稳定工作区 UUID 的映射；主进程单实例串行读改写，写入失败不发布新快照。 */
export class PluginWorkspaceRegistry {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly filename: string) {}

  private transact<T>(operation: (registry: Registry) => T): Promise<T> {
    const result = this.pending.then(async () => {
      let registry: Registry;
      try {
        registry = parseRegistry(await readFile(this.filename, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        registry = { version: 1, workspaces: [] };
      }
      const value = operation(registry);
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
        workspace = { name: normalized, id: randomUUID() };
        registry.workspaces.push(workspace);
      }
      return workspace;
    });
  }
}
