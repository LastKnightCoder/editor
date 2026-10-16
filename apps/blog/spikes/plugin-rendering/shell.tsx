import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JsxRuntime from "react/jsx-runtime";
import * as JsxDevRuntime from "react/jsx-dev-runtime";
import * as PluginSdk from "@tau/plugins";
import * as Ui from "@tau/ui";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { Editor } from "@tau/editor";
import type { Descendant } from "slate";
import ArticlePage from "../../src/templates/article/ArticlePage";
import DndProvider from "../../src/components/DndProvider";
import { getBlogKit, setPublishedExtensions } from "./blog-kit";
import type { SpikeData } from "./contracts";

const shared: Record<string, unknown> = {
  react: React,
  "react-dom": ReactDOM,
  "react-dom/client": ReactDOMClient,
  "react/jsx-runtime": JsxRuntime,
  "react/jsx-dev-runtime": JsxDevRuntime,
  "@tau/plugins": PluginSdk,
  "@tau/ui": Ui,
};
interface LoadedPlugin {
  default: PluginSdk.PluginDefinition;
  editorExtensions: PluginSdk.PluginEditorExtension[];
  reactUseState: unknown;
}
const globals = window as typeof window & {
  __SPIKE_DATA__: SpikeData;
  spike?: {
    ready: boolean;
    error?: string;
    sharedReact?: boolean;
    pluginIds?: string[];
    nodeTypes?: string[];
    value?: Descendant[];
  };
};

async function bootstrap() {
  const data = globals.__SPIKE_DATA__;
  window._INIT_DATA_ = data.page;
  globals.spike = { ready: false };
  const plugins: LoadedPlugin[] = [];
  for (const dependency of data.plugins) {
    const response = await fetch(new URL(dependency.entry, location.href));
    if (!response.ok) throw new Error(`插件资源加载失败：${dependency.id} (${response.status})`);
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
    if (digest !== dependency.sha256) throw new Error(`插件摘要不匹配：${dependency.id}`);
    const module = { exports: {} };
    new Function("module", "exports", "require", new TextDecoder().decode(bytes))(
      module,
      module.exports,
      (id: string) => {
        if (!(id in shared)) throw new Error(`博客未提供共享模块：${id}`);
        return shared[id];
      }
    );
    const plugin = module.exports as LoadedPlugin;
    if (plugin.default.id !== dependency.id || plugin.default.version !== dependency.version)
      throw new Error("插件身份或版本不匹配");
    const types = plugin.editorExtensions.flatMap(
      extension => extension.elements?.map(element => element.type) ?? []
    );
    if (
      types.length !== dependency.nodeTypes.length ||
      dependency.nodeTypes.some(type => !types.includes(type))
    )
      throw new Error("插件节点声明不匹配");
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = new URL(dependency.css, location.href).href;
    await new Promise<void>((resolve, reject) => {
      css.onload = () => resolve();
      css.onerror = () => reject(new Error("插件样式加载失败"));
      document.head.append(css);
    });
    plugins.push(plugin);
  }
  setPublishedExtensions(plugins.flatMap(plugin => plugin.editorExtensions));
  const kit = getBlogKit(data.page.settings);
  const nodes = (data.page.content as { content: Descendant[] }).content;
  if (data.mode === "desktop") {
    const host = new PluginHost({ workspaceId: "spike", storage: createMemoryStorage() });
    for (const plugin of plugins) {
      host.registerTrusted(plugin.default);
      await host.enable(plugin.default.id);
    }
    window.addEventListener(
      "pagehide",
      () => {
        void host.dispose();
      },
      { once: true }
    );
  }
  globals.spike = {
    ready: true,
    sharedReact: plugins.every(plugin => plugin.reactUseState === React.useState),
    pluginIds: plugins.map(plugin => plugin.default.id),
    nodeTypes: [...kit.elementTypes],
    value: nodes,
  };
  const root = document.getElementById("root");
  if (!root) throw new Error("缺少 root");
  ReactDOMClient.createRoot(root).render(
    <Ui.UiProvider>
      {data.mode === "blog" ? (
        <ArticlePage />
      ) : (
        <DndProvider>
          <Editor
            kit={kit}
            initValue={nodes}
            readonly={false}
            onChange={value => {
              if (globals.spike) globals.spike.value = value;
            }}
          />
        </DndProvider>
      )}
    </Ui.UiProvider>
  );
}

void bootstrap().catch(error => {
  globals.spike = { ready: false, error: String(error) };
  const root = document.getElementById("root");
  if (root) {
    root.setAttribute("role", "alert");
    root.textContent = String(error);
  }
});
