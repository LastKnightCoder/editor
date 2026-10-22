import type { PluginDefinition } from "./contract";
import type { WhiteboardElementDefinition } from "./whiteboard";
import type { DevelopmentPluginPackage } from "./package";
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

export class ContentPluginRegistry {
  private snapshot: {
    definitions: readonly PluginDefinition[];
    extensions: NonNullable<PluginDefinition["editorExtensions"]>;
    codecs: NonNullable<PluginDefinition["editorCodecs"]>;
    whiteboardExtensions: NonNullable<PluginDefinition["whiteboardExtensions"]>;
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
    const codecs = definitions.flatMap(definition => definition.editorCodecs ?? []);
    assertUniqueEditorCodecs(codecs);
    const resources: Record<string, readonly ContentResourceSpec[]> = {};
    for (const definition of definitions)
      for (const extension of definition.editorExtensions ?? [])
        for (const element of extension.elements ?? [])
          if (element.resources?.length) resources[element.type] = element.resources;
    this.snapshot = {
      definitions: Object.freeze([...definitions]),
      extensions: Object.freeze(
        definitions.flatMap(definition => definition.editorExtensions ?? [])
      ),
      codecs: Object.freeze(codecs),
      whiteboardExtensions: Object.freeze(
        definitions.flatMap(definition => definition.whiteboardExtensions ?? [])
      ),
      whiteboardElements: Object.freeze(
        definitions.flatMap(
          definition =>
            definition.whiteboardExtensions?.flatMap(extension => extension.elements ?? []) ?? []
        )
      ),
      resources: Object.freeze(resources),
    };
  }
  load(artifacts: readonly DevelopmentPluginPackage[], modules: Readonly<Record<string, unknown>>) {
    this.install(artifacts.map(artifact => evaluatePluginPackage(artifact, modules)));
  }
  list() {
    return this.snapshot.definitions;
  }
  htmlSerializer(type: string) {
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
    const codecs = [...(options?.codecs ?? []), ...registry.codecs];
    assertUniqueEditorCodecs(codecs);
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
    getMarkdownWithPositions: (...args) => current().getMarkdownWithPositions(...args),
    elementToMarkdown: (...args) => current().elementToMarkdown(...args),
    leafToMarkdown: (...args) => current().leafToMarkdown(...args),
    leafToMarkdownStructured: (...args) => current().leafToMarkdownStructured(...args),
  };
}
