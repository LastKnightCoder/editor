import {
  assertElementVersions,
  type ElementContractDefinition,
  type ElementSpec,
} from "@tau/editor/contracts";
import {
  prepareContentContract,
  NODE_CONTRACT_PROPERTY,
  type ContentContract,
  type ContentContractDictionary,
  validateContentContracts,
} from "@tau/db-schema/content-contracts";
import type { Descendant } from "slate";
import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  isContentEntityReference,
} from "@tau/db-schema/content-identities";

export interface RegisteredElementContract<E extends ElementContractDefinition = ElementSpec> {
  readonly id: string;
  readonly contract: ContentContract;
  readonly element: E;
  readonly access: "read" | "edit" | "none";
  readonly current: boolean;
}

export interface ElementContractSource<E extends ElementContractDefinition = ElementSpec> {
  owner: string;
  elements: readonly E[];
}

/** 修复正文时为当前没有声明的节点合成契约所用的归属；这类节点只保留、不编辑 */
export const RECOVERED_OWNER = "host.recovered";

/** 实体块的契约要求有效的来源引用；缺失时不能沿用实体契约，否则写入校验拒绝 */
const entityValid = (node: Record<string, unknown>, contract: ContentContract) => {
  const entity = CONTENT_ENTITY_NODE_CONTRACTS[contract.type];
  if (!entity || contract.owner !== entity.owner) return true;
  const ref = node.entityRef as { kind?: unknown } | undefined;
  return isContentEntityReference(ref) && ref.kind === entity.kind;
};

/**
 * 静态声明的准备结果；文档始终按已有摘要匹配，不用当前插件重新解释旧数据。
 * 编辑器装配传完整 ElementSpec（按版本分发行为）；无界面转换只传持久化声明。
 */
export class ElementContractCatalog<E extends ElementContractDefinition = ElementSpec> {
  private constructor(
    private readonly entries: ReadonlyMap<string, RegisteredElementContract<E>>,
    private readonly active: ReadonlyMap<string, RegisteredElementContract<E>>,
    readonly dictionary: ContentContractDictionary
  ) {}

  static async prepare<E extends ElementContractDefinition>(
    sources: readonly ElementContractSource<E>[]
  ): Promise<ElementContractCatalog<E>> {
    const entries = new Map<string, RegisteredElementContract<E>>();
    const active = new Map<string, RegisteredElementContract<E>>();
    const dictionary: Record<string, ContentContract> = {};
    for (const source of sources) {
      for (const element of source.elements) {
        assertElementVersions(element);
        if (element.dataVersion === undefined) throw new Error("无版本节点不能进入契约目录");
        if (active.has(element.type)) throw new Error(`节点类型重复：${element.type}`);
        for (const item of [
          { element, access: "edit" as const, current: true },
          // 历史版本与当前声明同构（ElementSpec 的历史仍是 ElementSpec）
          ...(
            (element.previousVersions ?? []) as readonly {
              element: E;
              access: "read" | "edit" | "none";
            }[]
          ).map(previous => ({ ...previous, current: false })),
        ]) {
          const prepared = await prepareContentContract(source.owner, {
            type: item.element.type,
            dataVersion: item.element.dataVersion!,
            kind: item.element.kind,
            isVoid: item.element.isVoid,
            collaboration: item.element.collaboration,
            resources: item.element.resources,
          });
          const entry = Object.freeze({ ...item, ...prepared });
          if (entries.has(entry.id)) throw new Error("节点契约重复");
          entries.set(entry.id, entry);
          dictionary[entry.id] = entry.contract;
          if (item.current) active.set(element.type, entry);
        }
      }
    }
    return new ElementContractCatalog(entries, active, Object.freeze(dictionary));
  }

  get(id: string): RegisteredElementContract<E> | undefined {
    return this.entries.get(id);
  }

  current(type: string): RegisteredElementContract<E> | undefined {
    return this.active.get(type);
  }

  additionalContracts(existing: ContentContractDictionary): ContentContractDictionary {
    const identity = (value: ContentContractDictionary[string]) =>
      JSON.stringify([value.domain, value.owner, value.type, value.dataVersion]);
    const known = new Map(Object.entries(existing).map(([id, value]) => [identity(value), id]));
    return Object.fromEntries(
      Object.entries(this.dictionary).filter(
        ([id, value]) => !known.has(identity(value)) || known.get(identity(value)) === id
      )
    );
  }

  resolve(node: Record<string, unknown>): RegisteredElementContract<E> | undefined {
    const id = node[NODE_CONTRACT_PROPERTY];
    const entry = typeof id === "string" ? this.entries.get(id) : undefined;
    return entry?.contract.type === node.type ? entry : undefined;
  }

  /**
   * 修复已存正文，使其能被打开：有效的节点身份与契约原样保留，只补缺失或无效的部分——
   * 缺 collabId 或重复的分配新身份；契约缺失或不匹配的按当前声明绑定；当前也没有声明的类型
   * 合成 RECOVERED_OWNER 名下的契约原样保留（渲染为「内容已保留」占位，数据不丢）。
   * 实体块缺有效 entityRef 时同样按保留处理，不伪造引用。`repaired` 为 false 表示原文已合格。
   */
  async repairDocument(
    content: unknown,
    supplied: ContentContractDictionary = {}
  ): Promise<{ content: Descendant[]; contracts: ContentContractDictionary; repaired: boolean }> {
    let repaired = !Array.isArray(content);
    // 字典本身损坏时整体弃用，节点改按当前声明重新绑定
    const source = await validateContentContracts(supplied).catch(() => {
      repaired = true;
      return {} as ContentContractDictionary;
    });
    const contracts: Record<string, ContentContract> = {};
    const seen = new Set<string>();
    const lookup = (id: unknown) =>
      typeof id === "string" ? (source[id] ?? this.dictionary[id]) : undefined;
    const contractFor = async (node: Record<string, unknown>, inline: boolean) => {
      const type = node.type as string;
      const stored = lookup(node[NODE_CONTRACT_PROPERTY]);
      if (stored?.domain === "editor-node" && stored.type === type && entityValid(node, stored))
        return { id: node[NODE_CONTRACT_PROPERTY] as string, contract: stored };
      repaired = true;
      const current = this.current(type);
      if (current && entityValid(node, current.contract)) return current;
      return prepareContentContract(RECOVERED_OWNER, {
        type,
        dataVersion: 1,
        kind: inline ? "inline" : "block",
        isVoid: true,
      });
    };
    const visit = async (
      input: unknown,
      inline: boolean,
      depth: number
    ): Promise<Record<string, unknown>> => {
      if (depth > 64) throw new Error("正文层级超过限制");
      const node = (
        input && typeof input === "object" && !Array.isArray(input) ? structuredClone(input) : {}
      ) as Record<string, unknown>;
      if (typeof node.text === "string" && !Array.isArray(node.children)) return node;
      if (typeof node.type !== "string" || !node.type) {
        repaired = true;
        node.type = "paragraph";
      }
      const { id, contract } = await contractFor(node, inline);
      contracts[id] = contract;
      node[NODE_CONTRACT_PROPERTY] = id;
      if (typeof node.collabId !== "string" || !node.collabId || seen.has(node.collabId)) {
        repaired = true;
        node.collabId = crypto.randomUUID();
      }
      seen.add(node.collabId as string);
      for (const field of contract.textFields)
        if (typeof node[field] !== "string") {
          repaired = true;
          node[field] =
            node[field] === undefined || node[field] === null ? "" : String(node[field]);
        }
      const children = Array.isArray(node.children) ? node.children : [];
      if (!children.length) repaired = true;
      const childInline = children.some(
        child => typeof (child as { text?: unknown })?.text === "string"
      );
      node.children = children.length
        ? await Promise.all(children.map(child => visit(child, childInline, depth + 1)))
        : [{ type: "formatted", text: "" }];
      return node;
    };
    const roots: unknown[] = [];
    for (const node of Array.isArray(content) ? content : []) {
      if (typeof (node as { text?: unknown })?.text === "string") {
        // 根上的裸文本包进段落，正文根只能是元素
        repaired = true;
        roots.push({ type: "paragraph", children: [node] });
      } else roots.push(node);
    }
    if (!roots.length) {
      repaired = true;
      roots.push({ type: "paragraph", children: [{ type: "formatted", text: "" }] });
    }
    const value = [];
    for (const node of roots) value.push(await visit(node, false, 0));
    return {
      content: value as unknown as Descendant[],
      contracts: await validateContentContracts({ ...source, ...contracts }),
      repaired,
    };
  }

  async createDocument(content: readonly Descendant[], supplied: ContentContractDictionary = {}) {
    const source = await validateContentContracts(supplied);
    const contracts: Record<string, ContentContractDictionary[string]> = {};
    const visit = (input: Record<string, unknown>, depth = 0): Record<string, unknown> => {
      if (depth > 64) throw new Error("正文层级超过限制");
      if (typeof input.text === "string" && !Array.isArray(input.children))
        return structuredClone(input);
      if (!Array.isArray(input.children) || typeof input.type !== "string")
        throw new Error("正文节点无效");
      const id =
        typeof input[NODE_CONTRACT_PROPERTY] === "string"
          ? (input[NODE_CONTRACT_PROPERTY] as string)
          : this.current(input.type)?.id;
      const contract = id ? (source[id] ?? this.dictionary[id]) : undefined;
      if (!id || !contract || contract.domain !== "editor-node" || contract.type !== input.type)
        throw new Error("新建正文缺少节点声明，须提供有效来源契约");
      contracts[id] = contract;
      const node: Record<string, unknown> = {
        ...structuredClone(input),
        collabId: crypto.randomUUID(),
        [NODE_CONTRACT_PROPERTY]: id,
      };
      for (const field of contract.textFields) {
        if (node[field] === undefined) node[field] = "";
        if (typeof node[field] !== "string") throw new Error("源码字段必须是字符串");
      }
      node.children = input.children.map(child =>
        visit(child as Record<string, unknown>, depth + 1)
      );
      return node;
    };
    const value = content.map(node =>
      visit(node as unknown as Record<string, unknown>)
    ) as unknown as Descendant[];
    return { content: value, contracts: await validateContentContracts(contracts) };
  }
}
