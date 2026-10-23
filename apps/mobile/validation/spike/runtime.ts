import * as sdk from "@tau/plugins";
import * as react from "react";
import * as jsx from "react/jsx-runtime";
import { PluginHost, createBrowserStorage, normalizePageParams } from "@tau/plugins/host";
import { validatePluginManifest, type DevelopmentPluginPackage } from "@tau/plugins/package";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import { ContentPluginRegistry } from "@tau/plugins/content";
import type {
  PluginContext,
  PluginPageDefinition,
  PluginPageParams,
  PluginEnvironment,
  PluginNavigationEntry,
  JsonValue,
} from "@tau/plugins";
import type { Navigator } from "@/router/navigatorTypes";

export const PACKAGE_KEY = "tau-mobile-plugin-spike:packages";
export const DOCUMENT_KEY = "tau-mobile-plugin-spike:document";
export const WORKSPACE = "mobile-plugin-spike-v1";
export const modules = { "@tau/plugins": sdk, react, "react/jsx-runtime": jsx };

export async function verifyArtifacts(value: unknown): Promise<DevelopmentPluginPackage[]> {
  if (!Array.isArray(value) || value.length !== 2) throw new Error("需要两个固定验证包");
  const seen = new Set<string>();
  const artifacts: DevelopmentPluginPackage[] = [];
  for (const item of value) {
    const manifest = validatePluginManifest(item.manifest);
    if (
      !["spike.counter", "tau.abc"].includes(manifest.id) ||
      seen.has(manifest.id) ||
      manifest.backend
    )
      throw new Error("不在可信刺探样本范围内");
    seen.add(manifest.id);
    for (const [file, content] of [
      [manifest.main, item.code],
      ...(manifest.styles ? [[manifest.styles, item.css]] : []),
    ]) {
      if (typeof content !== "string" || content.length > 1_000_000)
        throw new Error("包文件无效或过大");
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
      const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join(
        ""
      );
      if (hex !== manifest.integrity[file]) throw new Error("插件文件摘要不匹配");
    }
    artifacts.push({ manifest, code: item.code, ...(manifest.styles ? { css: item.css } : {}) });
  }
  return artifacts;
}

export async function downloadArtifacts(storage: Storage = localStorage) {
  const response = await fetch("/__plugin-spike__/packages");
  if (!response.ok) throw new Error(`下载失败：${response.status}`);
  const artifacts = await verifyArtifacts(await response.json());
  storage.setItem(PACKAGE_KEY, JSON.stringify(artifacts));
  return artifacts;
}

export interface RegisteredPage {
  context: PluginContext;
  definition: PluginPageDefinition;
}

export class SpikeRuntime {
  readonly host: PluginHost;
  readonly content = new ContentPluginRegistry();
  readonly pages = new Map<string, RegisteredPage>();
  readonly entries = new Map<string, PluginNavigationEntry>();
  readonly pageStateProviders = new Map<string, () => JsonValue>();
  private styles: HTMLStyleElement[] = [];
  navigator?: Navigator;

  constructor(
    readonly environment: PluginEnvironment,
    storage: Storage = localStorage
  ) {
    this.host = new PluginHost({
      workspaceId: WORKSPACE,
      environment,
      storage: createBrowserStorage(storage),
      navigation: {
        registerEntry: (context, definition) => {
          const id = `${context.pluginId}:${definition.id}`;
          this.entries.set(id, definition);
          return {
            dispose: () => {
              this.entries.delete(id);
            },
          };
        },
      },
      pages: {
        register: (context, definition) => {
          const id = `${context.pluginId}:${definition.id}`;
          if (this.pages.has(id)) throw new Error("页面重复注册");
          const page = { context, definition };
          this.pages.set(id, page);
          return {
            id,
            open: async (params: PluginPageParams = {}) => {
              if (!this.navigator || this.pages.get(id) !== page || context.signal.aborted)
                throw new Error("插件页面不可用");
              const clean = normalizePageParams(params);
              const instanceId =
                definition.match === "params"
                  ? (definition.getId?.(clean) ?? JSON.stringify(clean))
                  : "single";
              this.navigator.push("spike-plugin-page", {
                id,
                instanceId,
                params: JSON.stringify(clean),
              });
            },
            dispose: () => {
              if (this.pages.get(id) === page) this.pages.delete(id);
            },
          };
        },
      },
    });
  }

  async start(artifacts: DevelopmentPluginPackage[]) {
    const verified = await verifyArtifacts(artifacts);
    const definitions = verified.map(artifact => evaluatePluginPackage(artifact, modules));
    this.content.install(definitions);
    try {
      for (const artifact of verified) {
        if (artifact.css) {
          const style = document.createElement("style");
          style.dataset.spikePlugin = artifact.manifest.id;
          style.textContent = artifact.css;
          document.head.append(style);
          this.styles.push(style);
        }
      }
      for (const definition of definitions) {
        this.host.registerTrusted(definition);
        await this.host.enable(definition.id);
      }
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  async dispose() {
    try {
      await this.host.dispose();
    } finally {
      this.styles.forEach(style => style.remove());
      this.styles = [];
      this.pages.clear();
      this.entries.clear();
      this.pageStateProviders.clear();
      this.content.install([]);
    }
  }
}
