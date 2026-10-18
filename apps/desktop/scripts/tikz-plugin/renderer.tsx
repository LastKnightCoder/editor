import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { Editor } from "@tau/editor";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import type { DevelopmentPluginPackage } from "@tau/plugins/package";
import { sharedPluginModules } from "../../src/app/plugins/shared-modules";
import { desktopContentPlugins } from "../../shared/content-plugins";
import { createDesktopKit } from "../../src/services/editorKit";
import { loadPublishedPlugins } from "../../../blog/src/services/plugin-runtime";
import { getBlogKit } from "../../../blog/src/services/editorKit";
import { importFromMarkdown, getMarkdown } from "../../src/utils/markdown";
import renderer from "../../src/renderers/TikzBlockRenderer";

const fixture = (
  window as unknown as {
    tikzFixture: {
      phase: string;
      artifact: DevelopmentPluginPackage;
      enabled: boolean;
      baseUrl: string;
    };
  }
).tikzFixture;
const source = String.raw`\begin{tikzpicture}\draw (0,0) circle (0.5);\node at (1,0) {$x$};\end{tikzpicture}`;
const markdown = "```tikz\n" + source + "\n```";
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
async function until(read: () => unknown, message: string) {
  const deadline = Date.now() + 45_000;
  while (!read()) {
    if (Date.now() > deadline)
      throw new Error(message + ": " + document.body.textContent?.slice(-600));
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const host = document.getElementById("root")!;
const root = createRoot(host);
const svg = () => host.querySelector("[data-tau-tikz-preview] svg");
const timings: Record<string, number> = {};

async function verify() {
  const definition = evaluatePluginPackage(fixture.artifact, sharedPluginModules);
  desktopContentPlugins.install(fixture.enabled ? [definition] : []);
  const kit = createDesktopKit();
  check(kit.elementTypes.includes("tikz") === fixture.enabled, "桌面插件装配状态不正确");
  const value = [
    { type: "tikz", content: source, children: [{ type: "formatted", text: "" }] },
  ] as unknown as Descendant[];
  const showEditor = (
    content: Descendant[],
    targetKit = kit,
    readonly = true,
    onInit?: (editor: SlateEditor) => void
  ) => {
    root.render(
      <UiProvider>
        <DndProvider backend={HTML5Backend}>
          <Editor
            key={JSON.stringify(content)}
            kit={targetKit}
            initValue={content}
            readonly={readonly}
            onInit={onInit}
          />
        </DndProvider>
      </UiProvider>
    );
  };
  const started = performance.now();
  if (!fixture.enabled) {
    let editor: SlateEditor | undefined;
    showEditor(
      [...value, { type: "paragraph", children: [{ type: "formatted", text: "邻接正文" }] }],
      kit,
      false,
      current => {
        editor = current;
      }
    );
    await until(() => editor, "未知节点编辑器没有初始化");
    const before = JSON.stringify(editor!.children[0]);
    Transforms.insertText(editor!, "更新", { at: { path: [1, 0], offset: 0 } });
    check(JSON.stringify(editor!.children[0]) === before, "编辑相邻正文改变了未知 TikZ 节点");
    root.render(
      <renderer.Preview
        block={{ id: "old", type: "tikz", content: source, metadata: { type: "tikz" } }}
        generating={false}
      />
    );
    await until(() => host.textContent?.includes("源码已保留"), "缺插件时未显示源码提示");
    check(host.querySelector("code")?.textContent === source, "聊天源码丢失");
    root.unmount();
    return {
      ok: true,
      phase: fixture.phase,
      cases: ["unknown-data-preserved", "missing-plugin-chat-source"],
    };
  }
  const parsed = importFromMarkdown(markdown);
  check(getMarkdown(parsed).trim() === markdown, "桌面 Markdown 往返失败");
  showEditor(parsed);
  await until(svg, "桌面 TikZ 未产生 SVG");
  check(
    svg()!.querySelector("path") && svg()!.textContent?.includes("@font-face"),
    "SVG 缺少路径或字体"
  );
  timings.desktop = performance.now() - started;
  check(!document.querySelector("iframe[data-tau-tikz]"), "完成后 iframe 未清理");

  for (const sample of [
    `\\begin{document}\n${source}\n\\end{document}`,
    `\\usepackage{amsmath}\n${source}`,
  ]) {
    showEditor([
      { type: "tikz", content: sample, children: [{ type: "formatted", text: "" }] },
    ] as unknown as Descendant[]);
    await until(svg, "历史 document/宏包源码未出图");
  }
  root.render(
    <renderer.Preview
      block={{ id: "old", type: "tikz", content: source, metadata: { type: "tikz" } }}
      generating={false}
    />
  );
  await until(svg, "旧聊天未通过插件组件出图");
  root.render(<div />);
  await until(() => !svg(), "桌面预览未卸载");

  const blogStarted = performance.now();
  await loadPublishedPlugins([
    {
      runtimeVersion: 1,
      manifest: fixture.artifact.manifest,
      entry: new URL("plugin/main.js", fixture.baseUrl).href,
      nodeTypes: ["tikz"],
    },
  ]);
  showEditor(value, getBlogKit());
  await until(svg, "博客未用发布的同一插件包出图");
  check(svg()!.textContent?.includes("@font-face"), "博客字体缺失");
  timings.blog = performance.now() - blogStarted;

  showEditor(
    [
      {
        type: "tikz",
        content: "\\thisCommandDoesNotExist",
        children: [{ type: "formatted", text: "" }],
      },
    ] as unknown as Descendant[],
    getBlogKit()
  );
  await until(() => host.textContent?.includes("请检查语法"), "语法错误未报告");
  check(!document.querySelector("iframe[data-tau-tikz]"), "失败后 iframe 未清理");
  showEditor([
    {
      type: "tikz",
      content: source + "\n% cancellation",
      children: [{ type: "formatted", text: "" }],
    },
  ] as unknown as Descendant[]);
  await until(() => document.querySelector("iframe[data-tau-tikz]"), "取消测试未开始编译");
  root.unmount();
  await until(() => !document.querySelector("iframe[data-tau-tikz]"), "卸载未取消编译");
  return {
    ok: true,
    phase: fixture.phase,
    timings,
    cases: [
      "desktop-svg-fonts",
      "document-preamble",
      "markdown-roundtrip",
      "legacy-chat",
      "blog-real-package",
      "syntax-error",
      "unmount-cancel",
    ],
  };
}

Object.assign(window, {
  tikzVerification: verify().catch(error => ({
    ok: false,
    error: String(error),
    stack: error.stack,
  })),
});
