import { version as appVersion } from "../../../package.json";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import {
  evaluatePluginPackage,
  evaluatePortablePluginPackage,
  adaptPortablePluginDefinition,
} from "@tau/plugins/rendering";
import type { PluginDefinition } from "@tau/plugins";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import { splitSections } from "@/entity/sections";
import type { ContentExecutionEnvelope } from "../../../shared/content-execution";
import { buildPublishSearchIndexPayload } from "../../../src-electron/main/modules/publish-search-index";

let currentHash = "";
const definitions = new Map<string, PluginDefinition>();
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
          definition = evaluatePluginPackage(artifact, sharedPluginModules);
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
            definition = evaluatePortablePluginPackage(artifact, sharedPluginModules, {
              environment: {
                platform: "desktop",
                layout: "unknown",
                input: { touch: false, finePointer: false },
                capabilities: [
                  "commands.v1",
                  "storage.v1",
                  "pages.v1",
                  "navigation.v1",
                  "settings.v1",
                  "ui.dialog.v1",
                  "editor.elements.v1",
                  "editor.codecs.v1",
                  "editor.source.v1",
                ],
              },
              appVersion,
              profiles: ["web-v1"],
            });
            definitions.set(key, definition);
          }
          snapshot.push(
            adaptPortablePluginDefinition(definition, artifact.manifest, "desktop").definition
          );
        }
      }
      desktopContentPlugins.install(snapshot);
      if (definitions.size > 128)
        for (const key of definitions.keys()) if (!keys.has(key)) definitions.delete(key);
      currentHash = envelope.hash;
    }
    const request = envelope.request;
    switch (request.operation) {
      case "validate":
        return true;
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
