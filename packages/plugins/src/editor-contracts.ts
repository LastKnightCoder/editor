import { assertElementVersions, type ElementSpec } from "@tau/editor/contracts";
import {
  prepareContentContract,
  NODE_CONTRACT_PROPERTY,
  type ContentContract,
  type ContentContractDictionary,
  validateContentContracts,
} from "@tau/db-schema/content-contracts";
import type { Descendant } from "slate";

export interface RegisteredElementContract {
  readonly id: string;
  readonly contract: ContentContract;
  readonly element: ElementSpec;
  readonly access: "read" | "edit" | "none";
  readonly current: boolean;
}

export interface ElementContractSource {
  owner: string;
  elements: readonly ElementSpec[];
}

/** 静态声明的准备结果；文档始终按已有摘要匹配，不用当前插件重新解释旧数据。 */
export class ElementContractCatalog {
  private constructor(
    private readonly entries: ReadonlyMap<string, RegisteredElementContract>,
    private readonly active: ReadonlyMap<string, RegisteredElementContract>,
    readonly dictionary: ContentContractDictionary
  ) {}

  static async prepare(sources: readonly ElementContractSource[]): Promise<ElementContractCatalog> {
    const entries = new Map<string, RegisteredElementContract>();
    const active = new Map<string, RegisteredElementContract>();
    const dictionary: Record<string, ContentContract> = {};
    for (const source of sources) {
      for (const element of source.elements) {
        assertElementVersions(element);
        if (element.dataVersion === undefined) throw new Error("无版本节点不能进入契约目录");
        if (active.has(element.type)) throw new Error(`节点类型重复：${element.type}`);
        for (const item of [
          { element, access: "edit" as const, current: true },
          ...(element.previousVersions ?? []).map(previous => ({ ...previous, current: false })),
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

  get(id: string): RegisteredElementContract | undefined {
    return this.entries.get(id);
  }

  current(type: string): RegisteredElementContract | undefined {
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

  resolve(node: Record<string, unknown>): RegisteredElementContract | undefined {
    const id = node[NODE_CONTRACT_PROPERTY];
    const entry = typeof id === "string" ? this.entries.get(id) : undefined;
    return entry?.contract.type === node.type ? entry : undefined;
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
