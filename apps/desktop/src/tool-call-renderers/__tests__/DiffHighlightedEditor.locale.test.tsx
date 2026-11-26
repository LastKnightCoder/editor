import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Editor as SlateEditor, Transforms, Node, type Editor as EditorType } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { buildMergedReviewContent } from "@/utils/review-merged-content";
import { getMarkdown } from "@/utils/markdown";

const observed = vi.hoisted(() => [] as EditorType[]);
vi.mock("@/services/editorKit", async () => {
  const { createEditorKit } = await import("@tau/editor");
  const { standardExtensions } = await import("@tau/editor/presets/standard");
  const kit = createEditorKit({ extensions: standardExtensions });
  return { getContentKit: () => kit };
});
vi.mock("@tau/editor", async importOriginal => {
  const original = await importOriginal<typeof import("@tau/editor")>();
  const React = await import("react");
  return {
    ...original,
    Editor: (props: ComponentProps<typeof original.Editor>) => {
      const current = React.useRef(props);
      current.current = props;
      const initialize = React.useCallback(
        (editor: EditorType, content: Parameters<NonNullable<typeof props.onInit>>[1]) => {
          observed.push(editor);
          current.current.onInit?.(editor, content);
        },
        []
      );
      return <original.Editor {...props} onInit={initialize} />;
    },
  };
});
import { Editor } from "@tau/editor";
import { getContentKit } from "@/services/editorKit";
import { DiffHighlightedEditor } from "../DiffHighlightedEditor";

function transfer() {
  const values = new Map<string, string>();
  return {
    values,
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
    get types() {
      return [...values.keys()];
    },
    files: [],
    items: [],
  };
}

it("只读合成说明换语保留真实编辑器、Slate选区及复制导入的原文本与富文本", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  observed.length = 0;
  const before = [
    "首段原文",
    "第二段原文",
    ":::highlight-block{color=yellow}\n**用户原始正文**\n:::",
    "第四段原文",
    "末段原文",
  ].join("\n\n");
  const after = before.replace("color=yellow", "color=blue");
  const content = buildMergedReviewContent({
    beforeMarkdown: before,
    afterMarkdown: after,
    patches: [
      {
        operationId: "original-operation",
        op: "replace",
        start: 0,
        end: before.length,
        beforeText: before,
        afterText: after,
        charDelta: after.length - before.length,
      },
    ],
    options: { collapseUnchanged: true, contextRadius: 0 },
  }).content;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={desktopI18n}>
          <DndProvider backend={HTML5Backend}>
            <DiffHighlightedEditor content={content} isDark={false} />
            <Editor
              kit={getContentKit()}
              initValue={[{ type: "paragraph", children: [{ type: "formatted", text: "" }] }]}
            />
          </DndProvider>
        </I18nRuntimeProvider>
      )
    );
    expect(observed).toHaveLength(2);
    const [review, paste] = observed;
    const editable = host.querySelector('[data-slate-editor="true"]');
    const projections = [...host.querySelectorAll("[data-review-display]")];
    expect(projections.length).toBeGreaterThan(0);
    await act(async () => Transforms.select(review, SlateEditor.range(review, [])));
    const selection = structuredClone(review.selection),
      value = JSON.stringify(review.children),
      markdown = getMarkdown(review.children);
    const copy = () => {
      const data = transfer();
      review.setFragmentData(data as unknown as DataTransfer, "copy");
      return data;
    };
    const baseline = copy();
    expect(
      JSON.parse(decodeURIComponent(window.atob(baseline.getData("application/x-slate-fragment"))))
    ).toEqual(review.getFragment());
    expect(baseline.getData("text/html")).not.toContain("data-review-display");
    expect(baseline.getData("text/html")).not.toContain("sr-only");
    let labels = projections.map(element => element.getAttribute("data-review-display"));
    for (const locale of ["en-US", "zh-TW"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(observed).toEqual([review, paste]);
      expect(host.querySelector('[data-slate-editor="true"]')).toBe(editable);
      expect([...host.querySelectorAll("[data-review-display]")]).toEqual(projections);
      const next = projections.map(element => element.getAttribute("data-review-display"));
      expect(next).not.toEqual(labels);
      labels = next;
      expect(review.selection).toEqual(selection);
      expect(JSON.stringify(review.children)).toBe(value);
      expect(getMarkdown(review.children)).toBe(markdown);
      expect([...copy().values]).toEqual([...baseline.values]);
    }
    const fragment = review.getFragment();
    await act(async () => {
      Transforms.select(paste, SlateEditor.start(paste, []));
      paste.insertData(baseline as unknown as DataTransfer);
    });
    expect(paste.children).toEqual(fragment);
    expect(getMarkdown(paste.children)).toBe(getMarkdown(fragment));
    expect([...Node.texts(paste)].some(([leaf]) => leaf.bold && leaf.text === "用户原始正文")).toBe(
      true
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(originalLocale);
  }
});
