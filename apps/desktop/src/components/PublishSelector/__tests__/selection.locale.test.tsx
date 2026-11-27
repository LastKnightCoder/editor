import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { Transforms, type Editor as SlateEditor, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import type { Project } from "@/types/project";
import type { DocTreeNode, EntityScope } from "../types";
import { EntitySelector } from "../components/EntitySelector";
import { ContentPreviewModal } from "../components/ContentPreviewModal";
import { publishSelectionTranslator } from "../i18n";

const state = vi.hoisted(() => ({ editor: undefined as SlateEditor | undefined }));
vi.mock("@/services/editorKit", async () => {
  const { createEditorKit, defineExtension } = await import("@tau/editor");
  const kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.publish-observer",
        plugins: [
          editor => {
            state.editor = editor;
            return editor;
          },
        ],
      }),
    ],
  });
  return { getContentKit: () => kit };
});
vi.mock("@/commands/project", () => ({ getProjectItemsByIds: vi.fn() }));
const content: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "原始正文不改变" }] },
];
const nodes: DocTreeNode[] = [
  { id: 1, title: "文档A", hasContent: true, content, children: [] },
  { id: 2, title: "文档B", hasContent: true, content, children: [] },
];
const project: Project = {
  id: 9,
  title: "原始项目",
  createTime: 1,
  updateTime: 1,
  children: [1, 2],
  desc: [],
  archived: false,
  pinned: false,
};
let host: HTMLDivElement;
let root: Root;
const button = (label: string) => {
  const element = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    node => node.textContent?.trim() === label
  );
  if (!element) throw new Error("action button missing: " + label);
  return element;
};
beforeEach(() => {
  vi.useFakeTimers();
  desktopLocaleSource.setLocale("zh-CN");
  state.editor = undefined;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useRealTimers();
});
async function assertNativeSelectionSurvivesLocale() {
  const editor = state.editor;
  if (!editor) throw new Error("preview editor not mounted");
  const editable = ReactEditor.toDOMNode(editor, editor);
  const [text] = ReactEditor.toDOMPoint(editor, { path: [0, 0], offset: 0 });
  const selection = window.getSelection();
  if (!selection) throw new Error("native selection unavailable");
  await act(async () => {
    editable.focus();
    Transforms.select(editor, { path: [0, 0], offset: 0 });
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => selection.setBaseAndExtent(text, 5, text, 1));
  const selected = selection.toString();
  expect(selected.length).toBeGreaterThan(0);
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(state.editor).toBe(editor);
    expect(ReactEditor.toDOMNode(editor, editor)).toBe(editable);
    expect(selection.anchorNode).toBe(text);
    expect([selection.anchorOffset, selection.focusOffset]).toEqual([5, 1]);
    expect(selection.toString()).toBe(selected);
  }
}

it("项目范围草稿与在途提交跨语言保留，预览沿用同一编辑器和原生选区", async () => {
  let resolve!: () => void;
  const pending = new Promise<void>(done => {
    resolve = done;
  });
  const update = vi.fn(() => pending);
  const load = vi.fn();
  const toggle = vi.fn();
  const scopes = new Map<number, EntityScope>([[9, { mode: "all" }]]);
  const cache = new Map([[9, nodes]]);
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <EntitySelector
          type="project"
          entities={[project]}
          isItemSelected={() => true}
          scopes={scopes}
          treeCache={cache}
          onToggleEntity={toggle}
          onUpdateScope={update}
          onLoadTree={load}
        />
      </I18nRuntimeProvider>
    )
  );
  await act(async () => button(publishSelectionTranslator.t("scope.manage")).click());
  const title = [...document.querySelectorAll("span")].find(node => node.textContent === "文档A");
  const row = title?.parentElement;
  const checkbox = row?.querySelector<HTMLButtonElement>('[role="checkbox"]');
  if (!checkbox) throw new Error("document checkbox missing");
  await act(async () => checkbox.click());
  const preview = [...document.querySelectorAll("span")].find(node => node.textContent === "文档B");
  if (!preview) throw new Error("document preview action missing");
  await act(async () => preview.click());
  const save = button(publishSelectionTranslator.t("save"));
  await assertNativeSelectionSurvivesLocale();
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(load).not.toHaveBeenCalled();
  expect(toggle).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  await act(async () => save.click());
  expect(update).toHaveBeenCalledExactlyOnceWith(9, { mode: "partial", nodeIds: new Set([2]) });
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  expect(document.contains(save)).toBe(true);
  expect(update).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  expect(document.contains(save)).toBe(false);
});

it("内容预览换语保留只读正文与尚未同步的反向原生选区", async () => {
  const close = vi.fn();
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <ContentPreviewModal
          open
          title="原始文档标题"
          content={content}
          contentKey={13}
          onClose={close}
          meta={{ updateTime: 1, createTime: 1 }}
        />
      </I18nRuntimeProvider>
    )
  );
  await assertNativeSelectionSurvivesLocale();
  expect(close).not.toHaveBeenCalled();
});

it("按界面生成的缺省标题检索后换语仍保留命中、草稿和原项目动作", async () => {
  desktopLocaleSource.setLocale("en-US");
  const toggle = vi.fn();
  const load = vi.fn();
  const update = vi.fn();
  const unmatched = { ...project, id: 10, title: "完全不匹配的原始项目" };
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <EntitySelector
          type="project"
          entities={[{ ...project, title: "" }, unmatched]}
          isItemSelected={() => true}
          scopes={new Map()}
          treeCache={new Map()}
          onToggleEntity={toggle}
          onUpdateScope={update}
          onLoadTree={load}
        />
      </I18nRuntimeProvider>
    )
  );
  const input = document.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error("search input missing");
  const query = publishSelectionTranslator.t("project.untitled", { id: project.id });
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => vi.advanceTimersByTimeAsync(300));
  const checkbox = document.querySelector<HTMLButtonElement>('[role="checkbox"]');
  if (!checkbox) throw new Error("project was not found by its displayed title");
  expect(host.textContent).not.toContain(unmatched.title);
  input.focus();
  input.setSelectionRange(Math.min(1, query.length), Math.min(3, query.length));
  const selection = [input.selectionStart, input.selectionEnd];
  for (const locale of ["zh-TW", "zh-CN"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector('input[type="text"]')).toBe(input);
    expect(document.querySelector('[role="checkbox"]')).toBe(checkbox);
    expect(host.textContent).not.toContain(unmatched.title);
    expect(input.value).toBe(query);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual(selection);
    expect(toggle).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  }
  await act(async () => checkbox.click());
  expect(toggle).toHaveBeenCalledExactlyOnceWith(project.id, false);
});
