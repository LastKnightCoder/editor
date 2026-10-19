import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { Editor, createEditorKit } from "@tau/editor";
import { UiProvider } from "@tau/ui";
import * as sdk from "@tau/plugins";
import "@tau/plugins/source-editor-host";
import { bindPluginServiceRenderers } from "@tau/plugins/services-host";
import { evaluatePluginPackage, type PublishedPluginRender } from "@tau/plugins/rendering";
import type { DevelopmentPluginPackage } from "@tau/plugins/package";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { standardExtensions } from "@tau/editor/presets/standard";
import { addContentPlugin } from "../../src/app/plugins/content-plugin-state";
import { DesktopPluginServicesProvider } from "../../src/app/plugins/ServiceProvider";
import useSettingStore from "../../src/stores/useSettingStore";
import { loadPublishedPlugins } from "../../../blog/src/services/plugin-runtime";
import { getBlogKit } from "../../../blog/src/services/editorKit";
import { setPublishedPlugins } from "../../../blog/src/services/plugin-registry";

const fixture = (
  window as unknown as {
    typstFixture: { artifact: DevelopmentPluginPackage; role: string; baseUrl: string };
  }
).typstFixture;
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
async function until(read: () => unknown, message: string) {
  const deadline = Date.now() + 30_000;
  while (!read()) {
    if (Date.now() > deadline)
      throw new Error(`${message}: ${document.body.textContent?.slice(-500)}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function verify() {
  let edit: ((source: string) => void) | undefined;
  let observed: sdk.PluginServices | undefined;
  const modules = {
    ...sharedPluginModules,
    "@tau/plugins": {
      ...sdk,
      usePluginServices: () => {
        observed = sdk.usePluginServices();
        return observed;
      },
      SourceBlockEditor: (props: sdk.SourceBlockEditorProps) => {
        edit = props.onChange;
        return createElement(sdk.SourceBlockEditor, props);
      },
    },
  };
  const raw = evaluatePluginPackage(fixture.artifact, modules);
  const definition = bindPluginServiceRenderers({
    ...raw,
    create() {
      throw new Error("静态渲染不得执行 activate");
    },
  });
  const enabled = fixture.role !== "disabled";
  if (enabled) addContentPlugin(fixture.artifact, definition);
  const kit = createEditorKit({
    extensions: [...standardExtensions, ...(enabled ? definition.editorExtensions! : [])],
  });
  const state = useSettingStore.getState();
  useSettingStore.setState({
    setting: { ...state.setting, database: { ...state.setting.database, active: "test-A" } },
  });
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  let editor: SlateEditor | undefined;
  let serial = 0;
  const show = async (value: Descendant[], targetKit = kit, readonly = true, blog = false) => {
    editor = undefined;
    const view = (
      <UiProvider>
        <DndProvider backend={HTML5Backend}>
          <Editor
            key={++serial}
            kit={targetKit}
            initValue={value}
            readonly={readonly}
            onInit={value => {
              editor = value;
            }}
          />
        </DndProvider>
      </UiProvider>
    );
    root.render(
      blog ? (
        view
      ) : (
        <DesktopPluginServicesProvider
          workspace={fixture.role === "editor-window" ? "pinned-db" : undefined}
        >
          {view}
        </DesktopPluginServicesProvider>
      )
    );
    await until(() => editor, "编辑器未初始化");
  };
  const source = "= TauTitle\n中文正文，行内 $x^2$。\n\n$ x^2 + y^2 = z^2 $";
  const node = {
    type: "typst",
    content: source,
    children: [{ type: "formatted", text: "" }],
  } as unknown as Descendant;
  if (!enabled) {
    await show(
      [node, { type: "paragraph", children: [{ type: "formatted", text: "邻接正文" }] }],
      kit,
      false
    );
    const before = JSON.stringify(editor!.children[0]);
    Transforms.insertText(editor!, "更新", { at: { path: [1, 0], offset: 0 } });
    check(JSON.stringify(editor!.children[0]) === before, "缺插件时 Typst 数据变化");
    root.unmount();
    return { ok: true, role: fixture.role, cases: ["unknown-node-preserved"] };
  }
  await show([{ ...node, content: "" } as Descendant], kit, false);
  await until(() => edit && observed, "独立窗口没有取得插件服务");
  const started = performance.now();
  edit!(source);
  await until(
    () => (editor!.children[0] as unknown as { compiledFrom?: string }).compiledFrom === source,
    "编辑后真实服务未写回缓存"
  );
  const saved = structuredClone(editor!.children[0]);
  await until(
    () => host.querySelector("[data-tau-typst-preview] h2")?.textContent?.includes("TauTitle"),
    "HTML 标题缺失"
  );
  check(host.textContent?.includes("中文正文"), "中文缺失");
  check(host.querySelector("[data-tau-typst-preview] svg"), "公式缺失");
  const firstCompileMs = performance.now() - started;
  const caller = new AbortController();
  const cancelled = observed!.typst
    .compile({ source: "#for i in range(1000000) { [Long] }" }, { signal: caller.signal })
    .then(
      () => false,
      error => error.name === "AbortError"
    );
  const parallel = observed!.typst.compile({ source: "= ParallelSuccess" });
  setTimeout(() => caller.abort(), 30);
  check(await cancelled, "真实请求未响应取消");
  check((await parallel).html.includes("ParallelSuccess"), "取消影响并行请求");
  await show([node], kit, true);
  const before = JSON.stringify(editor!.children);
  await until(() => host.querySelector("[data-tau-typst-preview] svg"), "只读预览未出图");
  check(JSON.stringify(editor!.children) === before, "只读挂载修改缓存");
  const oldServices = observed!;
  const dependency: PublishedPluginRender = {
    runtimeVersion: 1,
    manifest: fixture.artifact.manifest,
    entry: new URL("plugin/main.js", fixture.baseUrl).href,
    nodeTypes: ["typst"],
  };
  await loadPublishedPlugins([dependency]);
  await show([saved], getBlogKit(), true, true);
  await until(() => host.querySelector("[data-tau-typst-preview] svg"), "博客未显示缓存公式");
  check(host.textContent?.includes("中文正文"), "博客中文丢失");
  const ended = await oldServices.typst.compile({ source: "old window" }).then(
    () => false,
    error => error.name === "AbortError"
  );
  check(ended, "卸载作用域后旧服务仍可调用");
  await show([node], getBlogKit(), true, true);
  await until(() => host.querySelector("[data-tau-typst-preview] code"), "博客缺缓存时未保留源码");
  check(
    host.querySelector("[data-tau-typst-preview] code")!.textContent === source,
    "博客源码变化"
  );
  const legacy = evaluatePluginPackage(fixture.artifact, {
    ...sharedPluginModules,
    "@tau/plugins": { ...sdk, usePluginServices: undefined },
  });
  setPublishedPlugins([legacy]);
  await show([saved], getBlogKit(), true, true);
  await until(
    () => host.querySelector("[data-tau-typst-preview] svg"),
    "旧博客没有服务入口时缓存未显示"
  );
  await show([node], getBlogKit(), true, true);
  await until(
    () => host.querySelector("[data-tau-typst-preview] code"),
    "旧博客没有服务入口时源码未回退"
  );
  root.unmount();
  return {
    ok: true,
    role: fixture.role,
    firstCompileMs,
    cases: [
      "no-activate",
      "real-service-html",
      "chinese-and-math",
      "edit-cache",
      "caller-cancel-isolated",
      "readonly-mount-no-write",
      "scope-disposed",
      "blog-cache",
      "blog-source-fallback",
      "blog-without-service-api",
    ],
  };
}
(window as unknown as { typstVerification: Promise<unknown> }).typstVerification = verify().catch(
  error => ({ ok: false, role: fixture.role, error: String(error), stack: error.stack })
);
