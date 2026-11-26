import { createI18nRuntime, createLocaleStore, type I18nRuntime } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { editorMessages } from "../../../../i18n-runtime";
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

async function mount(
  value: Descendant[],
  {
    readonly = false,
    touch = false,
    runtime,
  }: { readonly?: boolean; touch?: boolean; runtime?: I18nRuntime } = {}
) {
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
  const content = (
    <DndProvider backend={HTML5Backend}>
      <Editor ref={ref} kit={kit} initValue={value} readonly={readonly} />
    </DndProvider>
  );
  await act(async () =>
    root!.render(
      runtime ? <I18nRuntimeProvider runtime={runtime}>{content}</I18nRuntimeProvider> : content
    )
  );
  return ref;
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

it("独立书签编辑弹层继承语言，切换时保留草稿焦点且确认前不写正文", async () => {
  const locale = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: locale });
  const { t } = runtime.get(editorMessages);
  try {
    const ref = await mount([bookmark(), paragraph()], { runtime });
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    const before = JSON.stringify(editor.children);
    vi.useFakeTimers();
    await act(async () =>
      editor.commands.execute(
        "tau.bookmark.edit",
        undefined,
        editor.children[0] as BookmarkElement,
        [0]
      )
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    const field = [...document.querySelectorAll("input")].find(
      input => input.value === "卡片笔记写作法"
    );
    if (!field) throw new Error("书签编辑未打开");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "未提交的书签标题"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
    field.setSelectionRange(1, 4);
    for (const next of ["zh-TW", "en-US"]) {
      await act(async () => locale.setLocale(next));
      expect(
        [...document.querySelectorAll("input")].find(input => input.value === "未提交的书签标题")
      ).toBe(field);
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 4]);
      expect(ref.current?.getEditor()).toBe(editor);
      expect(JSON.stringify(editor.children)).toBe(before);
    }
    const done = [...document.querySelectorAll("button")].find(
      button => button.textContent === t("image.done")
    );
    if (!done) throw new Error("书签确认入口未挂载");
    await act(async () => done.click());
    expect(editor.children[0]).toMatchObject({
      overrides: { title: "未提交的书签标题" },
      meta: { title: "卡片笔记写作法" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  } finally {
    const cancel = [...document.querySelectorAll("button")].find(
      button => button.textContent === t("image.cancel")
    );
    if (cancel) await act(async () => cancel.click());
    if (vi.isFakeTimers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
    await act(async () => root?.unmount());
    root = undefined;
    runtime.dispose();
    vi.useRealTimers();
  }
});
