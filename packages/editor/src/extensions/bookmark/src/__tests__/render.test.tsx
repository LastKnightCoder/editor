import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit } from "@tau/editor";
import type { EditorRef } from "@tau/editor";
import { IEditorInteraction } from "@tau/editor/api";
import linkExtension from "@tau/editor/extensions/link";
import { IOpenerService } from "@tau/shared/host-services";

import bookmarkExtension from "../index";
import type { BookmarkElement } from "../types";

const text = () => ({ type: "formatted", text: "" });
const paragraph = () => ({ type: "paragraph", children: [text()] }) as unknown as Descendant;
const bookmark = (patch: Partial<BookmarkElement> = {}) =>
  ({
    type: "bookmark",
    url: "https://sspai.com/post/1",
    meta: {
      title: "卡片笔记写作法",
      description: "三个月的实践记录",
      siteName: "少数派",
      sourceImage: "https://sspai.com/c.png",
      fetchedAt: 1,
    },
    children: [text()],
    ...patch,
  }) as unknown as Descendant;

const open = vi.fn();
let root: Root | undefined;
let host: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  open.mockClear();
});

async function mount(value: Descendant[], { readonly = false, touch = false } = {}) {
  const kit = createEditorKit({
    extensions: [bookmarkExtension, linkExtension],
    services: [
      register => {
        register(IOpenerService, { open });
        if (touch) register(IEditorInteraction, { touch: true });
      },
    ],
  });
  const ref = createRef<EditorRef>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} initValue={value} readonly={readonly} />
      </DndProvider>
    )
  );
}

const card = () => host.querySelector<HTMLElement>("[data-bookmark]")!;
const click = () =>
  act(async () => card().dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("书签卡片", () => {
  it("显示标题、描述、网站名与封面，单击交给宿主打开", async () => {
    await mount([bookmark(), paragraph()]);
    expect(card().getAttribute("data-bookmark")).toBe("row");
    expect(card().textContent).toContain("卡片笔记写作法");
    expect(card().textContent).toContain("三个月的实践记录");
    expect(card().textContent).toContain("少数派");
    expect(card().querySelector("img")?.getAttribute("src")).toBe("https://sspai.com/c.png");
    await click();
    expect(open).toHaveBeenCalledWith("https://sspai.com/post/1");
  });

  it("三种外观按节点渲染；封面卡没有封面时按横向卡", async () => {
    await mount([bookmark({ appearance: "cover" }), paragraph()]);
    expect(card().getAttribute("data-bookmark")).toBe("cover");
    await act(async () => root!.unmount());
    host.remove();

    await mount([bookmark({ appearance: "compact" }), paragraph()]);
    expect(card().getAttribute("data-bookmark")).toBe("compact");
    await act(async () => root!.unmount());
    host.remove();

    await mount([
      bookmark({ appearance: "cover", meta: { title: "无图", fetchedAt: 1 } }),
      paragraph(),
    ]);
    expect(card().getAttribute("data-bookmark")).toBe("row");
  });

  it("读取失败显示网址与重试；只读时不显示重试", async () => {
    const failed = bookmark({ meta: { failed: true, fetchedAt: 1 } });
    await mount([failed, paragraph()]);
    expect(card().textContent).toContain("sspai.com/post/1");
    expect(card().textContent).toContain("重试");
    await act(async () => root!.unmount());
    host.remove();

    await mount([failed, paragraph()], { readonly: true });
    expect(card().textContent).not.toContain("重试");
    await click();
    expect(open).toHaveBeenCalled();
  });

  it("触屏编辑态单击只选中，阅读态单击打开", async () => {
    await mount([bookmark(), paragraph()], { touch: true });
    await click();
    expect(open).not.toHaveBeenCalled();
    await act(async () => root!.unmount());
    host.remove();

    await mount([bookmark(), paragraph()], { touch: true, readonly: true });
    await click();
    expect(open).toHaveBeenCalledWith("https://sspai.com/post/1");
  });
});
