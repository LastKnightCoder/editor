import {
  createMarkdownProcessor,
  isInlinePosition,
  serializeUnknownBlock,
  serializeUnknownInline,
  type MarkdownCodec,
  type MarkdownProcessor,
  type MarkdownProcessorOptions,
} from "@tau/markdown";
import type { Descendant } from "slate";
import {
  NODE_CONTRACT_PROPERTY,
  validateContentContracts,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import type { ElementContractCatalog } from "./editor-contracts";
import type { ElementContractDefinition } from "@tau/editor/contracts";

const CARRIER = "tau.contract-payload";
type NodeData = { type: string; children: NodeData[]; [key: string]: unknown };
export interface OwnedMarkdownCodec {
  owner: string;
  codec: MarkdownCodec;
}
export interface ContractMarkdownDocument {
  content: Descendant[];
  contracts: ContentContractDictionary;
}

export async function createContractMarkdownProcessor(options: {
  catalog: ElementContractCatalog<ElementContractDefinition>;
  contracts: ContentContractDictionary;
  codecs: readonly OwnedMarkdownCodec[];
  textCodecs?: MarkdownProcessorOptions["textCodecs"];
  onFallback?: (type: string, reason: "unsupported" | "failed") => void;
}): Promise<
  MarkdownProcessor & {
    importDocument(markdown: string, ignoreTypes?: string[]): Promise<ContractMarkdownDocument>;
  }
> {
  const contracts = await validateContentContracts(options.contracts);
  const resolved = new Map<string, MarkdownCodec>();
  const defaults = new Map<string, MarkdownCodec>();
  const current: MarkdownCodec[] = [];
  const originals = new Map<MarkdownCodec, MarkdownCodec>();
  if (options.catalog.current(CARRIER)) throw new Error("无损载荷类型由宿主保留");
  for (const { owner, codec } of options.codecs) {
    const active = options.catalog.current(codec.type);
    if (!active || active.contract.owner !== owner) throw new Error("导出器不属于当前节点声明");
    const version = codec.dataVersion ?? active.contract.dataVersion;
    const entry = Object.entries(options.catalog.dictionary).find(
      ([, contract]) =>
        contract.owner === owner && contract.type === codec.type && contract.dataVersion === version
    );
    if (!entry || entry[1].domain !== "editor-node" || resolved.has(entry[0]))
      throw new Error("导出版本未声明或重复");
    const serializer = codec.serializer;
    const prepared: MarkdownCodec = {
      ...codec,
      isVoid: entry[1].isVoid,
      serializer: serializer
        ? {
            ...serializer,
            isBlock: entry[1].kind === "block",
            toMarkdown(element, children, parent) {
              const output = serializer.toMarkdown(element, children, parent);
              if (output && typeof (output as unknown as { then?: unknown }).then === "function")
                void Promise.resolve(output).catch(() => undefined);
              if (typeof output !== "string") throw new Error("Markdown 导出器必须同步返回字符串");
              return output;
            },
            toMarkdownStructured: serializer.toMarkdownStructured
              ? (element, children, parent) => {
                  const output = serializer.toMarkdownStructured!(element, children, parent);
                  if (
                    output &&
                    typeof (output as unknown as { then?: unknown }).then === "function"
                  )
                    void Promise.resolve(output).catch(() => undefined);
                  if (!output || typeof output.output !== "string")
                    throw new Error("Markdown 位置导出无效");
                  return output;
                }
              : undefined,
          }
        : undefined,
    };
    resolved.set(entry[0], prepared);
    originals.set(prepared, codec);
    if (entry[0] === active.id) {
      current.push(prepared);
      defaults.set(codec.type, prepared);
    }
  }

  const collect = (node: NodeData, into: Record<string, ContentContractDictionary[string]>) => {
    if (typeof node.text === "string" && !Array.isArray(node.children)) return;
    const id = node[NODE_CONTRACT_PROPERTY];
    if (id !== undefined) {
      if (
        typeof id !== "string" ||
        !contracts[id] ||
        contracts[id].domain !== "editor-node" ||
        contracts[id].type !== node.type
      )
        throw new Error("导出节点缺少匹配的数据契约");
      into[id] = contracts[id];
    }
    for (const child of node.children ?? []) collect(child, into);
  };
  const processor = createMarkdownProcessor({
    codecs: current,
    textCodecs: options.textCodecs,
    resolveCodec(element) {
      const node = element as unknown as NodeData;
      const id = node[NODE_CONTRACT_PROPERTY];
      if (id === undefined) return defaults.get(node.type);
      if (
        typeof id !== "string" ||
        !contracts[id] ||
        contracts[id].domain !== "editor-node" ||
        contracts[id].type !== node.type
      )
        throw new Error("节点与文档契约不匹配");
      return resolved.get(id);
    },
    serializeUnknown(element, parent, error) {
      const node = element as unknown as NodeData;
      options.onFallback?.(node.type, error === undefined ? "unsupported" : "failed");
      const used: Record<string, ContentContractDictionary[string]> = {};
      collect(node, used);
      const payload = Object.keys(used).length
        ? {
            type: CARRIER,
            children: [],
            format: 1,
            node,
            contracts: used,
          }
        : node;
      return isInlinePosition(parent)
        ? serializeUnknownInline(payload)
        : serializeUnknownBlock(payload);
    },
  });
  const incremental = processor.createIncrementalSerializer.bind(processor);

  return Object.assign(processor, {
    createIncrementalSerializer(
      policy: Parameters<MarkdownProcessor["createIncrementalSerializer"]>[0]
    ) {
      return incremental({
        ...policy,
        codecs: [
          ...policy.codecs,
          ...[...originals]
            .filter(([, source]) => policy.codecs.includes(source))
            .map(([prepared]) => prepared),
        ],
      });
    },
    async importDocument(
      markdown: string,
      ignoreTypes?: string[]
    ): Promise<ContractMarkdownDocument> {
      const collected: Record<string, ContentContractDictionary[string]> = {};
      const merge = (dictionary: ContentContractDictionary) => {
        for (const [id, contract] of Object.entries(dictionary)) {
          collected[id] = contract;
        }
      };
      const restore = async (node: NodeData): Promise<NodeData> => {
        if (node.type === CARRIER) {
          if (node.format !== 1 || !node.node || typeof node.node !== "object")
            throw new Error("无损节点载荷无效");
          const carried = await validateContentContracts(node.contracts);
          merge(carried);
          const value = structuredClone(node.node) as NodeData;
          if (typeof value.type !== "string" || !Array.isArray(value.children))
            throw new Error("无损节点结构无效");
          let count = 0;
          const verify = (entry: NodeData, depth = 0) => {
            if (++count > 150000 || depth > 64 || !entry || typeof entry !== "object")
              throw new Error("无损节点结构超过限制或无效");
            if (typeof entry.text === "string" && !Array.isArray(entry.children)) return;
            const id = entry[NODE_CONTRACT_PROPERTY];
            if (
              id !== undefined &&
              (typeof id !== "string" ||
                !carried[id] ||
                carried[id].domain !== "editor-node" ||
                carried[id].type !== entry.type)
            )
              throw new Error("无损节点缺少契约");
            if (!Array.isArray(entry.children)) throw new Error("无损节点缺少子树");
            for (const child of entry.children) verify(child, depth + 1);
          };
          verify(value);
          return value;
        }
        if (typeof node.text === "string" && !Array.isArray(node.children)) return node;
        const current = options.catalog.current(node.type);
        if (!current) throw new Error(`普通节点缺少当前契约：${node.type}`);
        collected[current.id] = current.contract;
        return {
          ...node,
          [NODE_CONTRACT_PROPERTY]: current.id,
          children: await Promise.all(node.children.map(restore)),
        };
      };
      const content = await Promise.all(
        (processor.importFromMarkdown(markdown, ignoreTypes) as unknown as NodeData[]).map(restore)
      );
      return {
        content: content as unknown as Descendant[],
        contracts: await validateContentContracts(collected),
      };
    },
  });
}
