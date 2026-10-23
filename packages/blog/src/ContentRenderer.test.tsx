import { act, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import type { ContentNode, DataResult } from "@tau/plugins/publish-data";
import { ContentRenderer, type ContentRendererProps } from "./ContentRenderer";
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

it("渲染协议 1 加载原始格式 3 清单，只求值正文而不激活插件", async () => {
  setup();
  const content = result(7);
  const dependency = content.data.pluginRenderers![0];
  dependency.manifest = {
    ...dependency.manifest,
    formatVersion: 3,
    platform: "portable",
    profile: "web-v1",
    targets: {
      desktop: {
        minAppVersion: "0.59.1",
        required: ["editor"],
        optional: [],
        elements: { "example.widget": "edit" },
      },
      android: {
        minAppVersion: "0.2.2",
        required: ["editor"],
        optional: [],
        elements: { "example.widget": "edit" },
      },
    },
  };
  const prepared = await prepareContent(content, new AbortController().signal);
  expect(dependency.runtimeVersion).toBe(1);
  expect(prepared.extensions[0].elements?.[0].type).toBe("example.widget");
  expect(prepared.styles).toContain(css);
  dependency.nodeTypes = ["other.node"];
  await expect(prepareContent(content, new AbortController().signal)).rejects.toThrow("节点归属");
});
const paragraph = (...children: ContentNode[]): ContentNode => ({
  type: "paragraph",
  children: [{ type: "formatted", text: "" }, ...children, { type: "formatted", text: "" }],
});
const link = (contentType: string, refId: number, text: string): ContentNode => ({
  type: "content-link",
  contentType,
  refId,
  contentId: refId,
  contentTitle: text,
  children: [{ type: "formatted", text }],
});

it("项目文档列表使用共用卡片布局，标题、摘要与卡片整体指向对应文档", async () => {
  setup();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const content = result(7);
  content.data.pluginRenderers = [];
  if ("content" in content.data.content)
    content.data.content.content = [
      {
        type: "project-card-list",
        items: [
          {
            id: 34,
            title: "子文档",
            summary: "文档的两行摘要",
            target: { key: "doc:project:12:34", type: "doc", id: 34 },
          },
        ],
        children: [{ type: "formatted", text: "" }],
      },
    ];
  try {
    await act(async () =>
      root.render(
        <ContentRenderer
          content={content}
          hrefFor={target =>
            target.key === "doc:project:12:34" ? "/notes/projects/12/34" : undefined
          }
        />
      )
    );
    await vi.waitFor(async () => {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      expect(container.querySelector("a")?.getAttribute("href")).toBe("/notes/projects/12/34");
    });
    const card = container.querySelector("a")!;
    expect(card.parentElement?.className).toContain(
      "grid-cols-[repeat(auto-fill,minmax(15em,1fr))]"
    );
    expect(card.textContent).toBe("子文档文档的两行摘要");
    expect(card.querySelectorAll("svg")).toHaveLength(2);
    expect(card.lastElementChild?.className).toContain("line-clamp-2");
    expect(card.className).toContain("hover:shadow-card");
    for (const target of [card, card.firstElementChild!, card.lastElementChild!])
      expect(target.closest("a")).toBe(card);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("公开参数只有正文、路由与语义插槽，不暴露编辑器装配", () => {
  expectTypeOf<keyof ContentRendererProps>().toEqualTypeOf<
    | "content"
    | "nodes"
    | "hrefFor"
    | "renderLink"
    | "onOutline"
    | "fallback"
    | "className"
    | "style"
  >();
});
function setup() {
  vi.stubGlobal("crypto", {
    subtle: {
      digest: (algorithm: string, bytes: ArrayBuffer) =>
        webcrypto.subtle.digest(algorithm, Buffer.from(new Uint8Array(bytes))),
    },
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    randomUUID: webcrypto.randomUUID.bind(webcrypto),
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => new Response(url.pathname.endsWith(".css") ? css : code))
  );
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}

it("准备界面由调用方提供，加载错误交给模板错误边界", async () => {
  setup();
  class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
    state = { error: undefined as unknown };
    static getDerivedStateFromError(error: unknown) {
      return { error };
    }
    render() {
      return this.state.error ? <aside>{String(this.state.error)}</aside> : this.props.children;
    }
  }
  const container = document.createElement("div");
  document.body.append(container);
  const caught = vi.fn();
  const root = createRoot(container, { onCaughtError: caught });
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    const pending = result(1);
    await act(async () => root.render(<ContentRenderer content={pending} />));
    expect(container.textContent).toBe("");
    await act(async () =>
      root.render(<ContentRenderer content={pending} fallback={<span>作者的等待界面</span>} />)
    );
    expect(container.textContent).toBe("作者的等待界面");
    const broken = result(2);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("摘要不符"))
    );
    await act(async () =>
      root.render(
        <Boundary>
          <ContentRenderer content={broken} />
        </Boundary>
      )
    );
    await vi.waitFor(async () => {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      expect(caught).toHaveBeenCalled();
    });
    expect(container.textContent).toContain("资源摘要不匹配");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

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

it("插件 CSS 和正文伴生 CSS 分别保留原文，不改写选择器或动画名称", async () => {
  setup();
  const content = result(1);
  const companion = ":root { --accent: blue } .article::before { animation: pulse 2s }";
  content.data.contentStyles = [{ href: "content.css", integrity: hash(companion) }];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: URL) =>
        new Response(
          url.pathname.endsWith("content.css")
            ? companion
            : url.pathname.endsWith("widget.css")
              ? css
              : code
        )
    )
  );
  const prepared = await prepareContent(content, new AbortController().signal);
  expect(prepared.styles).toEqual([css, companion]);
});

it("同一公开模块实现可接入五个正式内容插件，不使用具体节点适配", async () => {
  setup();
  const directory = resolve(__dirname, "../../../tests/fixtures/plugins");
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
    const readArtifact = async (file: string) => {
      const source = await readFile(join(base, file), "utf8");
      return hash(source) === manifest.integrity[file] ? source : source.replace(/\r\n/g, "\n");
    };
    files.set(new URL(entry, data.dataUrl).href, await readArtifact(manifest.main));
    if (styles) files.set(new URL(styles, data.dataUrl).href, await readArtifact(manifest.styles));
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

it("并列正文和预览状态独立，CSS 原样加载并随实例卸载清理", async () => {
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
    expect([...container.querySelectorAll("style")].map(node => node.textContent)).toEqual([
      css,
      css,
    ]);
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

it("链接预览里嵌套的渲染器不继承父正文的内容插件", async () => {
  setup();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const outer = result(7),
    inner = result(19);
  inner.data.pluginRenderers = [];
  outer.data.links = { "article:2": { key: "article:2", type: "article", id: 2 } };
  if ("content" in outer.data.content)
    outer.data.content.content.push(paragraph(link("article", 2, "第二篇")));
  try {
    await act(async () =>
      root.render(
        <ContentRenderer
          content={outer}
          renderLink={({ children }) => (
            <span>
              {children}
              <ContentRenderer content={inner} />
            </span>
          )}
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

it("站内链接按本文链接表解析，模板只给地址；未发布只显示文字", async () => {
  setup();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const content = result(7);
  content.data.pluginRenderers = [];
  content.data.links = { "project-item:34": { key: "doc:project:12:34", type: "doc", id: 34 } };
  if ("content" in content.data.content)
    content.data.content.content = [
      paragraph(link("project-item", 34, "项目文档"), link("card", 404, "未发布")),
    ];
  const seen: string[] = [];
  try {
    await act(async () =>
      root.render(
        <ContentRenderer
          content={content}
          hrefFor={target => `/docs/${target.id}`}
          onOutline={headings => seen.push(JSON.stringify(headings))}
        />
      )
    );
    await vi.waitFor(async () => {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      expect(container.textContent).toContain("未发布");
    });
    expect(
      [...container.querySelectorAll("a")].map(a => [a.textContent, a.getAttribute("href")])
    ).toEqual([["项目文档", "/docs/34"]]);
    expect(seen).toEqual(["[]"]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("目录取正文顶层标题，发布设置随数据生效", async () => {
  setup();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const content = result(7);
  content.data.pluginRenderers = [];
  content.settings = { appearance: { image: { borderRadius: "lg", shadow: "none" } } };
  if ("content" in content.data.content)
    content.data.content.content = [
      { type: "header", level: 2, children: [{ type: "formatted", text: "第一节" }] },
      paragraph({ type: "formatted", text: "正文" }),
    ];
  let headings: unknown;
  try {
    await act(async () =>
      root.render(<ContentRenderer content={content} onOutline={value => (headings = value)} />)
    );
    await vi.waitFor(async () => {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      expect(headings).toEqual([{ level: 2, title: "第一节" }]);
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("插件媒体组件使用发布站插槽与发布设置的外观，不提供上传", async () => {
  setup();
  const mediaCode = `const React=require('react');const sdk=require('@tau/plugins');
function Gallery({attributes,element,children}) {
  const appearance=sdk.useMediaAppearance();
  const resource=sdk.useResource(element.url,{kind:'image'});
  return React.createElement('div',attributes,React.createElement('figure',{contentEditable:false,'data-radius':appearance&&appearance.borderRadius,'data-upload':String(sdk.useResourceUpload()===undefined),'data-src':resource.src},React.createElement(sdk.MediaImage,{url:element.url,alt:'图'})),children);
}
module.exports.default=sdk.definePlugin({id:'example.widget',name:'示例',version:'1.0.0',editorExtensions:[{id:'example.widget',apiVersion:1,elements:[{type:'example.widget',kind:'block',isVoid:true,render:Gallery}]}],create(){throw Error('不能激活桌面生命周期')}});`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => new Response(url.pathname.endsWith(".css") ? css : mediaCode))
  );
  const content = result(3);
  content.data.pluginRenderers![0].manifest.integrity["main.js"] = hash(mediaCode);
  content.settings = { appearance: { image: { borderRadius: "lg", shadow: "none" } } };
  const url = "https://cdn.example.com/a.png";
  if ("content" in content.data.content)
    content.data.content.content = [
      { type: "example.widget", url, children: [{ type: "formatted", text: "" }] },
    ];
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ContentRenderer content={content} />));
    await vi.waitFor(async () => {
      await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      expect(container.querySelector("figure img")?.getAttribute("src")).toBe(url);
    });
    expect(container.querySelector("figure")?.dataset).toMatchObject({
      radius: "lg",
      upload: "true",
      src: url,
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
