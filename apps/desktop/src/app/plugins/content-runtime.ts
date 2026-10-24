import { version as appVersion } from "../../../package.json";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { evaluateDesktopPluginPackage } from "../../../shared/plugin-rendering";
import { desktopPortableHost } from "../../../shared/plugin-package";
import type { PluginDefinition } from "@tau/plugins";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import { splitSections } from "@/entity/sections";
import type { ContentExecutionEnvelope } from "../../../shared/content-execution";
import { buildPublishSearchIndexPayload } from "../../../src-electron/main/modules/publish-search-index";

let currentHash = "";
const definitions = new Map<string, PluginDefinition>();
let currentDefinitions: PluginDefinition[] = [];
Object.assign(globalThis, {
  tauContentExecute(envelope: ContentExecutionEnvelope) {
    if (envelope.hash !== currentHash) {
      if (!envelope.artifacts) throw new Error("内容插件快照未装配");
      const keys = new Set<string>();
      const snapshot = envelope.artifacts.map(artifact => {
        const key = JSON.stringify(artifact.manifest);
        keys.add(key);
        let definition = definitions.get(key);
        if (!definition) {
          definition = evaluateDesktopPluginPackage(artifact, sharedPluginModules, appVersion);
          definitions.set(key, definition);
        }
        return definition;
      });
      if (import.meta.env.DEV) {
        for (const artifact of envelope.portableArtifacts ?? []) {
          const key = JSON.stringify(artifact.manifest);
          keys.add(key);
          let definition = definitions.get(key);
          if (!definition) {
            definition = evaluatePortablePluginPackage(
              artifact,
              sharedPluginModules,
              desktopPortableHost(appVersion)
            );
            definitions.set(key, definition);
          }
          snapshot.push(definition);
        }
      }
      desktopContentPlugins.install(snapshot);
      currentDefinitions = snapshot;
      if (definitions.size > 128)
        for (const key of definitions.keys()) if (!keys.has(key)) definitions.delete(key);
      currentHash = envelope.hash;
    }
    const request = envelope.request;
    switch (request.operation) {
      case "validate":
        return true;
      case "inspect": {
        const definition = currentDefinitions.find(value => value.id === request.id);
        if (!definition) throw new Error("待检查的插件定义未装配");
        return {
          editor: Boolean(definition.editorExtensions?.length),
          whiteboard: Boolean(definition.whiteboardExtensions?.length),
        };
      }
      case "publish-search":
        return buildPublishSearchIndexPayload(request.input);
      case "markdown":
        return getMarkdown(request.nodes);
      case "parse":
        return importFromMarkdown(request.markdown);
      case "markdown-sections":
        return splitSections(importFromMarkdown(request.markdown), request.title, request.whole);
      case "sections":
        return splitSections(request.nodes, request.title, request.whole);
      case "index": {
        const parsed = JSON.parse(request.input.raw);
        const nodes = Array.isArray(parsed) ? parsed : [];
        const content = getMarkdown(nodes).trim();
        return {
          content,
          ...(request.input.sections && content
            ? { sections: splitSections(nodes, request.input.title, request.input.whole) }
            : {}),
        };
      }
    }
  },
});
