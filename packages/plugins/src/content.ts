import { createContractMarkdownProcessor } from "./contract-markdown";
import {
  normalizeContentMetricRules,
  type ContentMetricRule,
} from "@tau/db-schema/content-metrics";
import type { PluginDefinition } from "./contract";
import type { WhiteboardElementDefinition, WhiteboardExtension } from "@tau/whiteboard";
import { WhiteboardContractCatalog, hostWhiteboardExtensions } from "@tau/whiteboard/contracts";
import type { DevelopmentPluginPackage } from "./package";
import { ElementContractCatalog } from "./editor-contracts";
import type { EditorExtension, ElementContractDefinition } from "@tau/editor/contracts";
import { createMarkdownProcessor, type MarkdownProcessor } from "@tau/markdown";
import type {
  ContentResourceDeclarations,
  ContentResourceSpec,
} from "@tau/db-schema/content-resources";
import {
  evaluatePluginPackage,
  getPluginNodeTypes,
  getPluginWhiteboardTypes,
  assertUniqueEditorCodecs,
} from "./rendering.ts";

/** 一组节点持久化声明，按 id 归属；EditorExtension 结构上即满足，无界面场景可直接写纯数据 */
export interface ElementContractGroup {
  readonly id: string;
  readonly elements?: readonly ElementContractDefinition[];
}

export class ContentPluginRegistry {
  constructor(private readonly onMetrics?: (rules: readonly ContentMetricRule[]) => void) {}
  private metricRules: readonly ContentMetricRule[] = Object.freeze([]);
  private revision = 0;
  private listeners = new Set<() => void>();
  readonly getRevision = () => this.revision;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  get metrics() {
    return this.metricRules;
  }

  private preparedWhiteboardContracts?: Promise<WhiteboardContractCatalog>;
  private preparedContracts?: Promise<ElementContractCatalog>;
  private contractCatalog?: ElementContractCatalog;
  private kitContracts = new WeakMap<readonly EditorExtension[], Promise<ElementContractCatalog>>();
  private groupContracts = new WeakMap<
    readonly ElementContractGroup[],
    Promise<ElementContractCatalog<ElementContractDefinition>>
  >();
  private snapshot: {
    definitions: readonly PluginDefinition[];
    extensions: NonNullable<PluginDefinition["editorExtensions"]>;
    codecs: NonNullable<PluginDefinition["editorCodecs"]>;
    whiteboardExtensions: readonly WhiteboardExtension[];
    whiteboardElements: readonly WhiteboardElementDefinition[];
    resources: ContentResourceDeclarations;
  } = {
    definitions: Object.freeze([]),
    extensions: Object.freeze([]),
    codecs: Object.freeze([]),
    whiteboardExtensions: Object.freeze([]),
    whiteboardElements: Object.freeze([]),
    resources: Object.freeze({}),
  };
  /** 插件节点的资源声明（节点类型 → 资源字段） */
  get resources() {
    return this.snapshot.resources;
  }
  get whiteboardExtensions() {
    return this.snapshot.whiteboardExtensions;
  }
  get whiteboardElements() {
    return this.snapshot.whiteboardElements;
  }
  get extensions() {
    return this.snapshot.extensions;
  }
  get codecs() {
    return this.snapshot.codecs;
  }

  currentDataVersions() {
    return new Map(
      this.snapshot.extensions
        .flatMap(extension => extension.elements ?? [])
        .map(element => [element.type, element.dataVersion])
    );
  }

  get importCodecs() {
    const versions = this.currentDataVersions();
    return this.snapshot.codecs.filter(
      codec => codec.dataVersion === undefined || codec.dataVersion === versions.get(codec.type)
    );
  }

  prepareWhiteboardContracts(): Promise<WhiteboardContractCatalog> {
    if (this.preparedWhiteboardContracts) return this.preparedWhiteboardContracts;
    const snapshot = this.snapshot;
    const prepared = WhiteboardContractCatalog.prepare(
      snapshot.definitions.map(definition => ({
        owner: definition.id,
        elements: (
          definition.whiteboardExtensions?.flatMap(extension => extension.elements ?? []) ?? []
        ).filter(
          element => element.dataVersion !== undefined
        ) as unknown as readonly WhiteboardElementDefinition[],
      }))
    )
      .then(catalog => {
        if (this.snapshot !== snapshot) throw new Error("插件声明已更新，请重新准备白板契约");
        return catalog;
      })
      .catch(error => {
        if (this.preparedWhiteboardContracts === prepared)
          this.preparedWhiteboardContracts = undefined;
        throw error;
      });
    return (this.preparedWhiteboardContracts = prepared);
  }
  prepareContracts(): Promise<ElementContractCatalog> {
    if (this.preparedContracts) return this.preparedContracts;
    const snapshot = this.snapshot;
    const prepared = ElementContractCatalog.prepare(
      snapshot.definitions.map(definition => ({
        owner: definition.id,
        elements:
          definition.editorExtensions?.flatMap(extension =>
            (extension.elements ?? []).filter(element => element.dataVersion !== undefined)
          ) ?? [],
      }))
    )
      .then(catalog => {
        if (snapshot !== this.snapshot) throw new Error("插件声明已更新，请重新准备文档契约");
        this.contractCatalog = catalog;
        return catalog;
      })
      .catch(error => {
        if (this.preparedContracts === prepared) this.preparedContracts = undefined;
        throw error;
      });
    return (this.preparedContracts = prepared);
  }

  /**
   * 契约感知的 Markdown 处理器：节点声明取宿主声明组加已装插件，与编辑器 kit 无关。
   * 每个 codec 必须有对应的节点声明，否则导出会静默退化成无损载荷，故直接报错。
   */
  async prepareMarkdown(
    groups: readonly ElementContractGroup[],
    options: {
      contracts: import("@tau/db-schema/content-contracts").ContentContractDictionary;
      codecs: readonly import("@tau/markdown").MarkdownCodec[];
      textCodecs?: NonNullable<Parameters<typeof createMarkdownProcessor>[0]>["textCodecs"];
      onFallback?: (type: string, reason: "unsupported" | "failed") => void;
    }
  ) {
    const snapshot = this.snapshot;
    const catalog = await this.prepareElementContracts(groups);
    const owned = options.codecs.map(codec => {
      const owner = catalog.current(codec.type)?.contract.owner;
      if (!owner) throw new Error(`Markdown codec 缺少节点声明：${codec.type}`);
      return { owner, codec };
    });
    for (const definition of snapshot.definitions)
      for (const codec of definition.editorCodecs ?? [])
        owned.push({ owner: definition.id, codec });
    return createContractMarkdownProcessor({ ...options, catalog, codecs: owned });
  }

  /** 按 kit 实际装配的元素建契约目录 */
  prepareEditorContracts(extensions: readonly EditorExtension[]): Promise<ElementContractCatalog> {
    return this.cachedContracts(this.kitContracts, extensions, extensions);
  }

  /** 按宿主声明组加已装插件的全部元素建契约目录，供不装配编辑器的转换使用 */
  prepareElementContracts(
    groups: readonly ElementContractGroup[]
  ): Promise<ElementContractCatalog<ElementContractDefinition>> {
    return this.cachedContracts(this.groupContracts, groups, [
      ...groups,
      ...this.snapshot.extensions,
    ]);
  }

  private cachedContracts<
    E extends ElementContractDefinition,
    G extends { readonly id: string; readonly elements?: readonly E[] },
  >(
    cache: WeakMap<readonly G[], Promise<ElementContractCatalog<E>>>,
    key: readonly G[],
    groups: readonly G[]
  ): Promise<ElementContractCatalog<E>> {
    const existing = cache.get(key);
    if (existing) return existing;
    const snapshot = this.snapshot;
    const owners = new Map<ElementContractDefinition, string>();
    for (const definition of snapshot.definitions)
      for (const extension of definition.editorExtensions ?? [])
        for (const element of extension.elements ?? []) owners.set(element, definition.id);
    const active = new Map<string, { owner: string; element: E }>();
    for (const group of groups)
      for (const element of group.elements ?? [])
        active.set(element.type, { owner: owners.get(element) ?? group.id, element });
    const sources = [...active.values()]
      .filter(item => item.element.dataVersion !== undefined)
      .map(item => ({ owner: item.owner, elements: [item.element] }));
    const result = ElementContractCatalog.prepare(sources)
      .then(catalog => {
        if (this.snapshot !== snapshot) throw new Error("插件声明已更新，请重新准备文档契约");
        return catalog;
      })
      .catch(error => {
        if (cache.get(key) === result) cache.delete(key);
        throw error;
      });
    cache.set(key, result);
    return result;
  }

  install(definitions: readonly PluginDefinition[]) {
    const ids = new Set<string>();
    const types = new Set<string>();
    const whiteboardTypes = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id)) throw new Error(`插件身份重复：${definition.id}`);
      ids.add(definition.id);
      for (const type of getPluginWhiteboardTypes(definition)) {
        if (whiteboardTypes.has(type)) throw new Error(`白板元素类型重复：${type}`);
        whiteboardTypes.add(type);
      }
      for (const type of getPluginNodeTypes(definition)) {
        if (types.has(type)) throw new Error(`插件节点类型重复：${type}`);
        types.add(type);
      }
    }
    const metrics = normalizeContentMetricRules(
      definitions.flatMap(definition => definition.editorMetrics ?? [])
    );
    for (const definition of definitions) {
      const owned = new Set(getPluginNodeTypes(definition));
      for (const rule of definition.editorMetrics ?? [])
        if (!owned.has(rule.type)) throw new Error("字数统计规则只能声明本插件的节点");
    }
    const codecs = definitions.flatMap(definition => definition.editorCodecs ?? []);
    const elements = new Map(
      definitions
        .flatMap(definition => definition.editorExtensions ?? [])
        .flatMap(extension => extension.elements ?? [])
        .map(element => [element.type, element])
    );
    const versions = new Map([...elements].map(([type, element]) => [type, element.dataVersion]));
    for (const codec of codecs) {
      const element = elements.get(codec.type);
      if (
        codec.dataVersion !== undefined &&
        ![
          element?.dataVersion,
          ...(element?.previousVersions ?? []).map(previous => previous.element.dataVersion),
        ].includes(codec.dataVersion)
      )
        throw new Error("Markdown 导出版本未在节点声明中登记");
    }
    assertUniqueEditorCodecs(codecs, versions);
    const resources: Record<string, readonly ContentResourceSpec[]> = {};
    for (const definition of definitions)
      for (const extension of definition.editorExtensions ?? [])
        for (const element of extension.elements ?? [])
          if (element.resources?.length) resources[element.type] = element.resources;
    this.onMetrics?.(metrics);
    this.metricRules = metrics;
    this.preparedWhiteboardContracts = undefined;
    this.preparedContracts = undefined;
    this.contractCatalog = undefined;
    this.kitContracts = new WeakMap();
    this.groupContracts = new WeakMap();
    this.snapshot = {
      definitions: Object.freeze([...definitions]),
      extensions: Object.freeze(
        definitions.flatMap(definition => definition.editorExtensions ?? [])
      ),
      codecs: Object.freeze(codecs),
      whiteboardExtensions: Object.freeze(
        definitions.flatMap(definition =>
          hostWhiteboardExtensions(definition.whiteboardExtensions ?? [], definition.id)
        )
      ),
      whiteboardElements: Object.freeze(
        definitions.flatMap(
          definition =>
            definition.whiteboardExtensions?.flatMap(extension => extension.elements ?? []) ?? []
        ) as unknown as WhiteboardElementDefinition[]
      ),
      resources: Object.freeze(resources),
    };
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  load(artifacts: readonly DevelopmentPluginPackage[], modules: Readonly<Record<string, unknown>>) {
    this.install(artifacts.map(artifact => evaluatePluginPackage(artifact, modules)));
  }
  list() {
    return this.snapshot.definitions;
  }
  htmlSerializer(type: string) {
    const versioned = this.currentDataVersions().get(type) !== undefined;
    if (versioned) {
      const snapshot = this.snapshot;
      return {
        type,
        toHtml: (element: Record<string, unknown>) => {
          if (snapshot !== this.snapshot) throw new Error("插件声明已更新，请重新导出");
          const catalog = this.contractCatalog;
          if (!catalog) throw new Error("节点契约尚未准备，请重新导出");
          const entry =
            element.tauContract === undefined ? catalog.current(type) : catalog.resolve(element);
          if (!entry || entry.contract.type !== type)
            throw new Error("当前节点版本不支持 HTML 导出");
          const currentVersion = catalog.current(type)?.contract.dataVersion;
          const definition = snapshot.definitions.find(item => item.id === entry.contract.owner);
          const serializer = definition?.editorExtensions
            ?.flatMap(extension => extension.htmlSerializers ?? [])
            .find(
              item =>
                item.type === type &&
                (item.dataVersion ?? currentVersion) === entry.contract.dataVersion
            );
          if (!serializer) throw new Error("当前节点版本不支持 HTML 导出");
          const output = serializer.toHtml(element);
          if (output && typeof (output as unknown as { then?: unknown }).then === "function")
            void Promise.resolve(output).catch(() => undefined);
          if (typeof output !== "string") throw new Error("HTML 导出器必须同步返回字符串");
          return output;
        },
      };
    }
    for (const extension of this.extensions) {
      const serializer = extension.htmlSerializers?.find(item => item.type === type);
      if (serializer) return serializer;
    }
    return undefined;
  }
}

export function createPluginMarkdownProcessor(
  options: Parameters<typeof createMarkdownProcessor>[0],
  registry: ContentPluginRegistry
): MarkdownProcessor {
  let previous = registry.codecs;
  const build = () => {
    const codecs = [...(options?.codecs ?? []), ...registry.importCodecs];
    assertUniqueEditorCodecs(codecs, registry.currentDataVersions());
    return createMarkdownProcessor({ ...options, codecs });
  };
  let processor = build();
  const current = () => {
    if (previous !== registry.codecs) {
      processor = build();
      previous = registry.codecs;
    }
    return processor;
  };
  return {
    importFromMarkdown: (...args) => current().importFromMarkdown(...args),
    importFromMarkdownWithPositions: (...args) =>
      current().importFromMarkdownWithPositions(...args),
    getMarkdown: (...args) => current().getMarkdown(...args),
    createIncrementalSerializer: policy => {
      let owner: MarkdownProcessor | undefined;
      let serialize: ReturnType<MarkdownProcessor["createIncrementalSerializer"]>;
      return value => {
        const next = current();
        if (next !== owner) {
          serialize = next.createIncrementalSerializer(policy);
          owner = next;
        }
        return serialize(value);
      };
    },
    getMarkdownWithPositions: (...args) => current().getMarkdownWithPositions(...args),
    elementToMarkdown: (...args) => current().elementToMarkdown(...args),
    leafToMarkdown: (...args) => current().leafToMarkdown(...args),
    leafToMarkdownStructured: (...args) => current().leafToMarkdownStructured(...args),
  };
}
