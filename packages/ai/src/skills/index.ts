import { parse as parseYaml } from "yaml";
import { AiError, type AiToolExecutor, type AiToolSpec } from "../contracts";
import { waitForSignal } from "../tools";

export interface AiSkillSourceEntry {
  id: string;
  path: string;
}
export interface AiSkillSource {
  id: string;
  revision: string;
  list(signal?: AbortSignal): Promise<readonly AiSkillSourceEntry[]>;
  /** 宿主还须校验实际路径与符号链接，不能越过来源根目录。 */
  read(path: string, signal?: AbortSignal): Promise<string>;
}
export interface AiSkillDescriptor {
  id: string;
  name: string;
  description: string;
  sourceId: string;
  sourceRevision: string;
  disableModelInvocation: boolean;
  allowedTools: readonly string[];
}
export interface AiLoadedSkill extends AiSkillDescriptor {
  instructions: string;
}
type SkillRecord = {
  descriptor: Readonly<AiSkillDescriptor>;
  instructions: string;
  directory: string;
  registration: SourceRegistration;
};
type SourceRegistration = { source: AiSkillSource; token: string; controller: AbortController };

function skillError(message: string) {
  return new AiError("AI_SKILL_INVALID", message);
}
const hasControlCharacter = (value: string) =>
  [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

/** 来源使用文件系统相对路径，不接受 URL 编码或平台绝对路径。 */
export function validateSkillResourcePath(path: string): string {
  if (!path || /[\\:]/.test(path) || hasControlCharacter(path) || path.startsWith("/"))
    throw new AiError("AI_SKILL_RESOURCE_INVALID", "技能资源必须是相对路径");
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new AiError("AI_SKILL_RESOURCE_INVALID", "技能资源路径编码无效");
  }
  const parts = decoded.split("/");
  if (
    parts.some(part => !part || part === "." || part === "..") ||
    /[\\:]/.test(decoded) ||
    hasControlCharacter(decoded)
  )
    throw new AiError("AI_SKILL_RESOURCE_INVALID", "技能资源不能越过声明目录");
  if (decoded !== path)
    throw new AiError("AI_SKILL_RESOURCE_INVALID", "技能资源使用原始相对路径，不接受 URL 编码");
  return path;
}

export function parseSkillDocument(
  text: string,
  fallbackName: string
): {
  name: string;
  description: string;
  instructions: string;
  disableModelInvocation: boolean;
  allowedTools: readonly string[];
} {
  const normalized = text.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(normalized);
  let metadata: Record<string, unknown> = {};
  if (normalized.startsWith("---\n") || normalized.startsWith("---\r\n")) {
    if (!match) throw skillError("技能 frontmatter 未完整结束");
    let value: unknown;
    try {
      value = parseYaml(match[1], { maxAliasCount: 0 });
    } catch {
      throw skillError("技能 frontmatter 不是有效的 YAML");
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw skillError("技能 frontmatter 必须是对象");
    metadata = value as Record<string, unknown>;
  }
  const instructions = normalized.slice(match?.[0].length ?? 0).trim();
  const name = typeof metadata.name === "string" ? metadata.name.trim() : fallbackName;
  if (!name || hasControlCharacter(name)) throw skillError("技能名称无效");
  const description =
    typeof metadata.description === "string"
      ? metadata.description.trim()
      : (instructions
          .split(/\r?\n/)
          .map(line => line.trim())
          .find(line => line && !line.startsWith("#")) ?? "");
  const rawTools = metadata["allowed-tools"];
  const allowedTools = Array.isArray(rawTools)
    ? rawTools
        .filter((value): value is string => typeof value === "string")
        .map(value => value.trim())
        .filter(Boolean)
    : typeof rawTools === "string"
      ? parseAllowedSkillTools(rawTools)
      : [];
  if (!description || !instructions) throw skillError("技能必须提供说明与正文");
  return {
    name,
    description,
    instructions,
    disableModelInvocation: metadata["disable-model-invocation"] === true,
    allowedTools: Object.freeze(allowedTools),
  };
}

export function parseAllowedSkillTools(value: string): string[] {
  const tools: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth++;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (character === "," || /\s/.test(character))) {
      if (current.trim()) tools.push(current.trim());
      current = "";
    } else current += character;
  }
  if (current.trim()) tools.push(current.trim());
  return tools;
}

export interface AiSkillSnapshot {
  readonly skills: readonly Readonly<AiSkillDescriptor>[];
  readonly executionIdentity: string;
  isCurrent(): boolean;
  load(id: string, signal?: AbortSignal): Promise<AiLoadedSkill>;
  readResource(id: string, relativePath: string, signal?: AbortSignal): Promise<string>;
}

export class AiSkillRegistry {
  private readonly sources = new Map<string, SourceRegistration>();

  constructor(private readonly maxResourceBytes = 256 * 1024) {}

  registerSource(source: AiSkillSource): () => void {
    if (!source.id || !source.revision) throw skillError("技能来源必须有身份和版本");
    if (this.sources.has(source.id)) throw skillError("技能来源身份重复");
    const registration = {
      source: Object.freeze({
        id: source.id,
        revision: source.revision,
        list: source.list.bind(source),
        read: source.read.bind(source),
      }),
      token: crypto.randomUUID(),
      controller: new AbortController(),
    };
    this.sources.set(source.id, registration);
    return () => {
      if (this.sources.get(source.id) !== registration) return;
      this.sources.delete(source.id);
      registration.controller.abort(new AiError("AI_SKILL_UNAVAILABLE", "技能来源已停用"));
    };
  }

  private current(record: SkillRecord) {
    return this.sources.get(record.registration.source.id) === record.registration;
  }

  private checkSize(text: string) {
    if (new TextEncoder().encode(text).byteLength > this.maxResourceBytes)
      throw skillError("技能资料超过当前读取预算");
  }

  private async scan(signal?: AbortSignal): Promise<Map<string, SkillRecord>> {
    const records = new Map<string, SkillRecord>();
    const registrations = [...this.sources.values()];
    for (const registration of registrations) {
      signal?.throwIfAborted();
      const { source } = registration;
      const entries = await this.readActive(registration, current => source.list(current), signal);
      for (const entry of entries) {
        const path = validateSkillResourcePath(entry.path);
        if (!entry.id || /[\/\\]/.test(entry.id) || hasControlCharacter(entry.id))
          throw skillError("技能身份无效");
        const text = await this.readActive(
          registration,
          current => source.read(path, current),
          signal
        );
        this.checkSize(text);
        const parsed = parseSkillDocument(text, entry.id);
        const id = `${source.id}:${entry.id}`;
        if (records.has(id)) throw skillError("技能来源返回了重复身份");
        const slash = path.lastIndexOf("/");
        records.set(id, {
          descriptor: Object.freeze({
            id,
            name: parsed.name,
            description: parsed.description,
            sourceId: source.id,
            sourceRevision: source.revision,
            disableModelInvocation: parsed.disableModelInvocation,
            allowedTools: parsed.allowedTools,
          }),
          instructions: parsed.instructions,
          directory: slash >= 0 ? path.slice(0, slash + 1) : "",
          registration,
        });
      }
    }
    return records;
  }

  private async readActive<T>(
    registration: SourceRegistration,
    read: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const controller = new AbortController();
    const signals = [registration.controller.signal, ...(signal ? [signal] : [])];
    const abort = (event: Event) => controller.abort((event.target as AbortSignal).reason);
    for (const current of signals) {
      if (current.aborted) controller.abort(current.reason);
      else current.addEventListener("abort", abort, { once: true });
    }
    try {
      controller.signal.throwIfAborted();
      const value = await waitForSignal(read(controller.signal), controller.signal);
      if (this.sources.get(registration.source.id) !== registration)
        throw new AiError("AI_SKILL_UNAVAILABLE", "技能来源已变化");
      return value;
    } finally {
      for (const current of signals) current.removeEventListener("abort", abort);
    }
  }

  async list(signal?: AbortSignal): Promise<readonly Readonly<AiSkillDescriptor>[]> {
    return [...(await this.scan(signal)).values()].map(record => record.descriptor);
  }

  async captureAvailable(
    manualIds: readonly string[] = [],
    signal?: AbortSignal
  ): Promise<AiSkillSnapshot> {
    const manual = new Set(manualIds);
    const skills = await this.list(signal);
    for (const id of manual)
      if (!skills.some(skill => skill.id === id))
        throw new AiError("AI_SKILL_UNAVAILABLE", `技能不可用：${id}`);
    return this.capture(
      skills
        .filter(skill => !skill.disableModelInvocation || manual.has(skill.id))
        .map(skill => skill.id),
      manualIds,
      signal
    );
  }

  async capture(
    ids: readonly string[],
    manualIds: readonly string[] = [],
    signal?: AbortSignal
  ): Promise<AiSkillSnapshot> {
    const available = await this.scan(signal);
    const selected = new Map<string, SkillRecord>();
    const manual = new Set(manualIds);
    for (const id of ids) {
      const record = available.get(id);
      if (!record) throw new AiError("AI_SKILL_UNAVAILABLE", `技能不可用：${id}`);
      if (record.descriptor.disableModelInvocation && !manual.has(id))
        throw new AiError("AI_SKILL_UNAVAILABLE", "该技能只能由用户显式点名");
      selected.set(id, record);
    }
    const get = (id: string) => {
      const record = selected.get(id);
      if (!record || !this.current(record))
        throw new AiError("AI_SKILL_UNAVAILABLE", "技能未被选择或来源已变化");
      return record;
    };
    return {
      skills: Object.freeze([...selected.values()].map(value => value.descriptor)),
      executionIdentity: JSON.stringify(
        [...selected.values()].map(record => [
          record.descriptor.id,
          record.descriptor.sourceRevision,
          record.registration.token,
        ])
      ),
      isCurrent: () => [...selected.values()].every(record => this.current(record)),
      load: async (id, signal) => {
        signal?.throwIfAborted();
        const record = get(id);
        return { ...record.descriptor, instructions: record.instructions };
      },
      readResource: async (id, relativePath, signal) => {
        const record = get(id);
        const path = validateSkillResourcePath(relativePath);
        if (path.split("/")[0] === "scripts")
          throw new AiError(
            "AI_SKILL_SCRIPT_UNSUPPORTED",
            "手机技能只提供参考资料，不提供脚本执行"
          );
        const text = await this.readActive(
          record.registration,
          current => record.registration.source.read(record.directory + path, current),
          signal
        );
        this.checkSize(text);
        return text;
      },
    };
  }

  async load(
    id: string,
    options: { manual?: boolean; signal?: AbortSignal } = {}
  ): Promise<AiLoadedSkill> {
    return (await this.capture([id], options.manual ? [id] : [], options.signal)).load(
      id,
      options.signal
    );
  }

  async readResource(
    id: string,
    path: string,
    options: { manual?: boolean; signal?: AbortSignal } = {}
  ): Promise<string> {
    return (await this.capture([id], options.manual ? [id] : [], options.signal)).readResource(
      id,
      path,
      options.signal
    );
  }
}

export function formatSkillCatalog(skills: readonly AiSkillDescriptor[]): string {
  return skills.map(skill => `${JSON.stringify(skill.id)}: ${skill.description}`).join("\n");
}

export function createSkillTools(
  snapshot: AiSkillSnapshot
): Array<{ spec: AiToolSpec; execute: AiToolExecutor }> {
  const base = {
    risk: "read" as const,
    sourceId: "skills",
    executionIdentity: snapshot.executionIdentity,
  };
  const ids = snapshot.skills.map(skill => skill.id);
  return [
    {
      spec: {
        ...base,
        id: "skills:load",
        name: "load_skill",
        description: "加载当前可用技能的完整说明",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", enum: ids } },
          required: ["id"],
          additionalProperties: false,
        },
      },
      execute: async (input, context) => {
        const { id } = input as { id: string };
        return { content: JSON.stringify(await snapshot.load(id, context.signal)) };
      },
    },
    {
      spec: {
        ...base,
        id: "skills:read-resource",
        name: "read_skill_resource",
        description: "读取技能目录内的参考资料，不执行脚本",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", enum: ids }, path: { type: "string" } },
          required: ["id", "path"],
          additionalProperties: false,
        },
      },
      execute: async (input, context) => {
        const { id, path } = input as { id: string; path: string };
        return { content: await snapshot.readResource(id, path, context.signal) };
      },
    },
  ];
}
