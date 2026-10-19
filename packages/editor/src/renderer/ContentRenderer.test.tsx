import { act } from "react";
import { createRoot } from "react-dom/client";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { DataResult } from "@tau/plugins/publish-data";
import { ContentRenderer } from "./ContentRenderer";
import { prepareContent, readVerified } from "./load";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const code = `const React=require('react');
function Widget({attributes,element,children}) {
  const [count,setCount]=React.useState(element.initial);
  return React.createElement('div',attributes,React.createElement('button',{contentEditable:false,onClick:()=>setCount(n=>n+1)},String(count)),children);
}
Widget.original=true;
module.exports.default=require('@tau/plugins').definePlugin({id:'example.widget',name:'示例',version:'1.0.0',editorExtensions:[{id:'example.widget',apiVersion:1,elements:[{type:'example.widget',kind:'block',isVoid:true,render:Widget}]}],create(){throw Error('不能激活桌面生命周期')}});`;
const css =
  ":root { --widget: red } button { animation: pulse 1s } @keyframes pulse { from { opacity: .9 } to { opacity: 1 } }";
function result(initial: number): DataResult {
  return {
    dataUrl: `https://example.com/data/${initial}.json`,
    data: {
      version: 1,
      key: `content-${initial}`,
      meta: { type: "card", publishTime: 1 },
      content: {
        id: initial,
        tags: [],
        createTime: 1,
        updateTime: 1,
        content: [{ type: "example.widget", initial, children: [{ type: "formatted", text: "" }] }],
      },
      pluginRenderers: [
        {
          runtimeVersion: 1,
          entry: "widget.js",
          styles: "widget.css",
          nodeTypes: ["example.widget"],
          manifest: {
            formatVersion: 1,
            apiVersion: 1,
            platform: "desktop",
            format: "cjs",
            editor: true,
            id: "example.widget",
            name: "示例",
            version: "1.0.0",
            main: "main.js",
            styles: "main.css",
            integrity: { "main.js": hash(code), "main.css": hash(css) },
          },
        },
      ],
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
function setup() {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => new Response(url.pathname.endsWith(".css") ? css : code))
  );
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}

it("摘要失败或提前取消不会执行插件或插入样式", async () => {
  setup();
  const controller = new AbortController();
  await expect(
    readVerified(new URL("https://example.com/widget.js"), "0".repeat(64), controller.signal)
  ).rejects.toThrow("摘要");
  controller.abort();
  await expect(prepareContent(result(1), controller.signal)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(document.querySelector("[data-tau-content-style]")).toBeNull();
});

it("贡献保持原样，重复节点或插件声明拒绝接入", async () => {
  setup();
  const data = result(1);
  const loaded = await prepareContent(data, new AbortController().signal);
  expect(
    (loaded.extensions[0].elements![0].render as unknown as { original: boolean }).original
  ).toBe(true);
  data.data.pluginRenderers!.push(data.data.pluginRenderers![0]);
  await expect(prepareContent(data, new AbortController().signal)).rejects.toThrow("重复");
});

it("同一公开模块实现可接入五个正式内容插件，不使用具体节点适配", async () => {
  setup();
  const directory = resolve(__dirname, "../../../../tests/fixtures/plugins");
  const catalog = JSON.parse(await readFile(join(directory, "catalog.json"), "utf8"));
  const nodeTypes: Record<string, string[]> = {
    "tau.html": ["html-block", "html-inline"],
    "tau.tikz": ["tikz"],
    "tau.typst": ["typst"],
    "tau.abc": ["abc"],
    "tau.custom-block": ["custom-block"],
  };
  const data = result(1);
  data.data.pluginRenderers = [];
  const files = new Map<string, string>();
  for (const item of catalog) {
    if (!nodeTypes[item.id]) continue;
    const base = join(directory, item.artifact);
    const manifest = JSON.parse(await readFile(join(base, "manifest.json"), "utf8"));
    const entry = item.id + "/main.js";
    const styles = manifest.styles ? item.id + "/main.css" : undefined;
    files.set(
      new URL(entry, data.dataUrl).href,
      await readFile(join(base, manifest.main), "utf8")
    );
    if (styles)
      files.set(
        new URL(styles, data.dataUrl).href,
        await readFile(join(base, manifest.styles), "utf8")
      );
    data.data.pluginRenderers.push({
      runtimeVersion: 1,
      manifest,
      entry,
      styles,
      nodeTypes: nodeTypes[item.id],
    });
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: URL) =>
        new Response(files.get(String(url)), { status: files.has(String(url)) ? 200 : 404 })
    )
  );
  const first = await prepareContent(data, new AbortController().signal);
  const second = await prepareContent(data, new AbortController().signal);
  expect(
    first.extensions.flatMap(extension => extension.elements?.map(element => element.type))
  ).toEqual(expect.arrayContaining(Object.values(nodeTypes).flat()));
  expect(first.extensions[0]).not.toBe(second.extensions[0]);
});

it("并列正文、预览各自拥有插件状态和样式，卸载及内容切换清理旧实例", async () => {
  setup();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const first = result(7),
    second = result(19);
  try {
    await act(async () =>
      root.render(
        <>
          <ContentRenderer content={first} />
          <ContentRenderer content={second} />
        </>
      )
    );
    await vi.waitFor(async () => {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      expect([...container.querySelectorAll("button")].map(node => node.textContent)).toEqual([
        "7",
        "19",
      ]);
    });
    const scopes = [...container.querySelectorAll("[data-tau-content]")];
    expect(scopes[0].getAttribute("data-tau-content")).not.toBe(
      scopes[1].getAttribute("data-tau-content")
    );
    const styles = [...container.querySelectorAll("style")].map(node => node.textContent);
    expect(styles[0]).not.toBe(styles[1]);
    expect(styles.every(style => style?.includes("[data-tau-content="))).toBe(true);
    await act(async () => container.querySelector("button")!.click());
    expect([...container.querySelectorAll("button")].map(node => node.textContent)).toEqual([
      "8",
      "19",
    ]);
    expect(first.data.content).toMatchObject({ content: [{ initial: 7 }] });
    await act(async () =>
      root.render(
        <>
          <ContentRenderer content={first} />
        </>
      )
    );
    expect(container.querySelectorAll("style")).toHaveLength(1);
    await act(async () => root.render(<ContentRenderer content={second} />));
    await vi.waitFor(async () => {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      expect(container.querySelector("button")?.textContent).toBe("19");
    });
    expect(container.querySelectorAll("style")).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
  expect(document.querySelector("[data-tau-content-style]")).toBeNull();
});

it("嵌套渲染器不继承父正文的内容插件", async () => {
  setup();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const outer = result(7),
    inner = result(19);
  inner.data.pluginRenderers = [];
  if ("content" in outer.data.content)
    outer.data.content.content.push({
      type: "example.nested",
      children: [{ type: "formatted", text: "" }],
    });
  try {
    await act(async () =>
      root.render(
        <ContentRenderer
          content={outer}
          extensions={[
            {
              id: "example.nested",
              apiVersion: 1,
              elements: [
                {
                  type: "example.nested",
                  kind: "block",
                  isVoid: true,
                  render: ({ attributes, children }) => (
                    <div {...attributes}>
                      <ContentRenderer content={inner} />
                      {children}
                    </div>
                  ),
                },
              ],
            },
          ]}
        />
      )
    );
    await vi.waitFor(async () => {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      expect(container.querySelectorAll("[data-tau-content]")).toHaveLength(2);
    });
    const nested = container.querySelector("[data-tau-content] [data-tau-content]")!;
    expect(nested.querySelector("button")).toBeNull();
    expect(nested.textContent).not.toContain("19");
    expect(container.querySelector("button")?.textContent).toBe("7");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
