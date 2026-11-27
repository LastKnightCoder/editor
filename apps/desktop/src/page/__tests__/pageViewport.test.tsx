import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor } from "slate";
import type { EditorRef } from "@tau/editor";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useContentViewport } from "@/hooks/useContentViewport";
import { definePage } from "../definePage";
import { createPageSchema, paramNumber } from "../core/paramsSchema";
import { PageHost } from "../PageHost";
import { PageProvider, usePage, usePageParams, type Navigator } from "../PageProvider";

const loads = new Map<number, { ready(): void; fail(): void }>();
let delayed = false;
let api: Navigator;
let host: HTMLDivElement;
let root: Root;

function DocumentPage() {
  const { id } = usePageParams<{ id: number }>();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const viewport = useContentViewport(element, `document:${id}`);
  const { onReady, onLoadError } = viewport;
  useEffect(() => {
    if (!element) return;
    let active = true;
    const load = {
      ready: () => {
        if (active) onReady(createEditor() as ReturnType<EditorRef["getEditor"]>);
      },
      fail: () => {
        if (!active) return;
        setFailed(true);
        onLoadError();
      },
    };
    loads.set(id, load);
    if (!delayed) load.ready();
    return () => {
      active = false;
    };
  }, [element, id, onLoadError, onReady]);
  return <div ref={setElement} role={failed ? "alert" : "document"} data-document-id={id} />;
}

const schema = createPageSchema({ id: paramNumber() });
definePage({
  key: "viewport-document",
  label: "文档",
  match: "params",
  getId: params => String(params.id),
  params: schema.schema,
  component: DocumentPage,
});
definePage({ key: "viewport-other", label: "其他页面", params: {}, component: () => <div /> });

function Host() {
  const { state, navigator } = usePage();
  api = navigator;
  return <PageHost state={state} />;
}

const frame = (key: string) => host.querySelector<HTMLElement>(`[data-page-key="${key}"]`);
const scroller = (id: number) => {
  const element = host.querySelector<HTMLElement>(`[data-document-id="${id}"]`);
  if (!element) throw new Error(`Missing document ${id}`);
  return element;
};
const shown = () => host.querySelector<HTMLElement>("[data-page-active]")?.dataset.pageKey;

beforeEach(async () => {
  loads.clear();
  delayed = false;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <PageProvider initialKey="viewport-document" initialParams={{ id: 1 }}>
        <Host />
      </PageProvider>
    )
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

// 事故回归：对话放大后返回时，正文重绑先收缩高度，浏览器把阅读偏移归零。
it("返回先保持上一页，正文就绪后在交接展示前恢复位置", async () => {
  scroller(1).scrollTop = 900;
  await act(async () => api.push("viewport-other"));
  scroller(1).scrollTop = 0;
  delayed = true;
  await act(async () => api.back());
  expect(shown()).toBe("viewport-other");
  expect(frame("viewport-document")?.getAttribute("aria-hidden")).toBe("true");
  expect(frame("viewport-document")?.hasAttribute("inert")).toBe(true);
  expect(frame("viewport-other")?.hasAttribute("inert")).toBe(true);

  await act(async () => loads.get(1)?.ready());
  expect(shown()).toBe("viewport-document");
  expect(scroller(1).scrollTop).toBe(900);
  expect(host.querySelector("[data-page-preparing]")).toBeNull();
  expect(frame("viewport-document")?.hasAttribute("inert")).toBe(false);

  scroller(1).scrollTop = 1100;
  await act(async () => loads.get(1)?.ready());
  expect(scroller(1).scrollTop).toBe(1100);
});

it("正文尚未就绪时再次导航，保留原位置供下次返回而不记录 Loading 的零值", async () => {
  scroller(1).scrollTop = 750;
  await act(async () => api.push("viewport-other"));
  scroller(1).scrollTop = 0;
  delayed = true;
  await act(async () => api.back());
  const abandoned = loads.get(1);
  await act(async () => api.push("viewport-other"));
  await act(async () => abandoned?.ready());
  expect(shown()).toBe("viewport-other");

  await act(async () => api.back());
  expect(shown()).toBe("viewport-other");
  await act(async () => loads.get(1)?.ready());
  expect(scroller(1).scrollTop).toBe(750);
  expect(shown()).toBe("viewport-document");
});

it("重复打开当前文档后，后续就绪通知不会拉回用户新滚到的位置", async () => {
  scroller(1).scrollTop = 700;
  await act(async () => api.push("viewport-document", { id: 1 }));
  scroller(1).scrollTop = 950;
  await act(async () => loads.get(1)?.ready());
  expect(scroller(1).scrollTop).toBe(950);
});

it("不同文档独立保存位置，前进重建后也恢复自己的位置", async () => {
  scroller(1).scrollTop = 600;
  await act(async () => api.push("viewport-document", { id: 2 }));
  scroller(2).scrollTop = 1200;
  scroller(1).scrollTop = 0;
  await act(async () => api.back());
  expect(scroller(1).scrollTop).toBe(600);
  await act(async () => api.forward());
  expect(scroller(2).scrollTop).toBe(1200);
});

it("正文加载失败时展示错误并结束等待，不永久覆盖在上一页", async () => {
  scroller(1).scrollTop = 400;
  await act(async () => api.push("viewport-other"));
  delayed = true;
  await act(async () => api.back());
  expect(shown()).toBe("viewport-other");
  await act(async () => loads.get(1)?.fail());
  expect(shown()).toBe("viewport-document");
  expect(host.querySelector("[data-page-preparing]")).toBeNull();
  expect(scroller(1).getAttribute("role")).toBe("alert");
});

it("字体等待中的恢复已被新导航取消时，迟到的就绪信号不能改变新页面", async () => {
  const original = Object.getOwnPropertyDescriptor(document, "fonts");
  let release: (() => void) | undefined;
  const fonts = {
    status: "loading",
    ready: new Promise<void>(resolve => {
      release = resolve;
    }),
  };
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  try {
    scroller(1).scrollTop = 850;
    await act(async () => api.push("viewport-other"));
    scroller(1).scrollTop = 0;
    await act(async () => api.back());
    expect(shown()).toBe("viewport-other");
    await act(async () => api.push("viewport-other"));
    fonts.status = "loaded";
    await act(async () => release?.());
    expect(shown()).toBe("viewport-other");
    await act(async () => api.back());
    expect(shown()).toBe("viewport-document");
    expect(scroller(1).scrollTop).toBe(850);
  } finally {
    if (original) Object.defineProperty(document, "fonts", original);
    else Reflect.deleteProperty(document, "fonts");
  }
});
