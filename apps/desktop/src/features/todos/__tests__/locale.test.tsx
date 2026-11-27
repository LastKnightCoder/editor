import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { Node, Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import type { TodoGroup } from "@/types";
import type { TodoEntry, TodoSnapshot } from "../types";
import type { TodoMutations } from "../queries";
import { todosTranslator } from "../i18n";
import { TodoDrawer } from "../components/TodoDrawer";
import { TodosNavGroups } from "../components/TodosNav";

const mocks = vi.hoisted(() => ({
  updateItem: vi.fn(),
  attachDescription: vi.fn(),
  initialized: vi.fn(),
  descriptionChanged: vi.fn(),
  filter: vi.fn(),
  snapshot: undefined as TodoSnapshot | undefined,
}));
vi.mock("@/page/PageProvider", () => ({
  useOverlayDismiss: () => undefined,
  usePage: () => ({ navigator: { push: vi.fn() } }),
}));
vi.mock("@/features/pomodoro/queries", () => ({
  useTodoFocusSummary: () => undefined,
  usePomodoroPresets: () => ({ active: [] }),
}));
vi.mock("@/features/schedule/queries", () => ({ useTodoSchedules: () => ({}) }));
vi.mock("@/hooks/useDocTasks", () => ({ useDocTaskSnapshot: () => ({ snapshot: undefined }) }));
vi.mock("../queries", () => ({
  useTodoSnapshot: () => ({ snapshot: mocks.snapshot }),
  useTodoMutations: () => ({}),
  useNow: () => 1,
}));
// Keep the real editor; this replaces only the library-backed document connector.
vi.mock("@/components/ContentEditor", async () => {
  const { Editor, createEditorKit } = await import("@tau/editor");
  const kit = createEditorKit({});
  return {
    default: (props: {
      initValue?: Descendant[];
      onChange?: (value: Descendant[]) => void;
      placeHolder?: string;
    }) => (
      <Editor
        kit={kit}
        readonly={false}
        initValue={props.initValue}
        placeHolder={props.placeHolder}
        onInit={mocks.initialized}
        onChange={value => {
          mocks.descriptionChanged(value);
          props.onChange?.(value);
        }}
      />
    ),
  };
});

const groups: TodoGroup[] = [
  {
    id: 1,
    title: "工作",
    color: "blue",
    sortIndex: 0,
    isArchived: false,
    isSystem: false,
    systemType: null,
    createTime: 1,
    updateTime: 1,
  },
  {
    id: 2,
    title: "截止",
    color: "red",
    sortIndex: 1,
    isArchived: false,
    isSystem: false,
    systemType: null,
    createTime: 1,
    updateTime: 1,
  },
];
const entry = (id: number, title: string): TodoEntry => ({
  id,
  groupId: 1,
  parentId: null,
  title,
  type: "normal",
  isCompleted: false,
  sortIndex: 0,
  isArchived: false,
  createTime: 1,
  updateTime: 1,
  descriptionContentId: 0,
  recurrence: null,
  occurrences: new Map(),
  noteLinks: [],
  childIds: [],
});
const first = entry(17, "原始任务"),
  second = entry(29, "第二任务");
const snapshot: TodoSnapshot = {
  groups,
  archivedGroups: [],
  entries: [first, second],
  byId: new Map([
    [first.id, first],
    [second.id, second],
  ]),
};
const mutations: TodoMutations = {
  createFromQuickAdd: vi.fn(),
  addSubtask: vi.fn(),
  setCompleted: vi.fn(),
  setOccurrence: vi.fn(),
  updateItem: mocks.updateItem,
  setReminders: vi.fn(),
  changeType: vi.fn(),
  updateRecurrence: vi.fn(),
  attachDescription: mocks.attachDescription,
  moveToGroup: vi.fn(),
  remove: vi.fn(),
  renameTag: vi.fn(),
  removeTag: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  setGroupArchived: vi.fn(),
  deleteGroup: vi.fn(),
  attachNote: vi.fn(),
  createNote: vi.fn(),
  detachNote: vi.fn(),
  renameNote: vi.fn(),
};
let host: HTMLDivElement, root: Root, client: QueryClient, original: string;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  original = desktopLocaleSource.getSnapshot();
  mocks.updateItem.mockResolvedValue(undefined);
  mocks.attachDescription.mockResolvedValue(undefined);
  mocks.snapshot = snapshot;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  document.body.innerHTML = "";
  desktopLocaleSource.setLocale(original);
  vi.useRealTimers();
});
const renderDrawer = async (current: TodoEntry) => {
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <QueryClientProvider client={client}>
          <DndProvider backend={HTML5Backend}>
            <TodoDrawer
              entry={current}
              snapshot={snapshot}
              groups={groups}
              now={1}
              mutations={mutations}
              onClose={vi.fn()}
              onOpen={vi.fn()}
              onToggle={vi.fn()}
              onDelete={vi.fn()}
            />
          </DndProvider>
        </QueryClientProvider>
      </I18nRuntimeProvider>
    )
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
};

it("换语保留任务标题与真实描述实例，不自动保存；切换任务才建立新会话", async () => {
  await renderDrawer(first);
  const editor = mocks.initialized.mock.calls.at(-1)?.[0] as SlateEditor | undefined;
  if (!editor) throw new Error("描述编辑器未挂载");
  await act(async () => Transforms.insertText(editor, "用户描述草稿"));
  expect(mocks.attachDescription).toHaveBeenCalledExactlyOnceWith(first, expect.any(Array));
  const source = document.querySelector("[data-slate-editor]"),
    before = JSON.stringify(editor.children);
  const saves = mocks.descriptionChanged.mock.calls.length;
  const input = document.querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${todosTranslator.t("drawer.taskTitle")}"]`
  );
  if (!input) throw new Error("标题输入未挂载");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      input,
      "未提交标题"
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
  input.setSelectionRange(1, 4);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(
      document.querySelector(`textarea[aria-label="${todosTranslator.t("drawer.taskTitle")}"]`)
    ).toBe(input);
    expect(input.value).toBe("未提交标题");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
    expect(mocks.initialized.mock.calls.at(-1)?.[0]).toBe(editor);
    expect(document.querySelector("[data-slate-editor]")).toBe(source);
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(mocks.descriptionChanged.mock.calls.length).toBe(saves);
    expect(mocks.attachDescription).toHaveBeenCalledTimes(1);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  }
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    )
  );
  expect(mocks.updateItem).toHaveBeenCalledWith(first, { title: "未提交标题" });
  await renderDrawer(second);
  expect(
    document.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${todosTranslator.t("drawer.taskTitle")}"]`
    )?.value
  ).toBe(second.title);
  const next = mocks.initialized.mock.calls.at(-1)?.[0] as SlateEditor | undefined;
  if (!next) throw new Error("第二任务编辑器未挂载");
  expect(next).not.toBe(editor);
  expect(Node.string(next)).toBe("");
});

it("换语保留项目过滤与原项目名称，点击后仍提交原始项目ID", async () => {
  function Harness() {
    const [selected, setSelected] = useState("1");
    return (
      <TodosNavGroups
        selectedId={selected}
        onSelect={id => {
          mocks.filter(id);
          setSelected(id);
        }}
      />
    );
  }
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>
      </I18nRuntimeProvider>
    )
  );
  const find = (name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(button =>
      button.textContent?.trim().startsWith(name)
    );
  const active = find(groups[0].title),
    target = find(groups[1].title);
  if (!active || !target) throw new Error("项目过滤未挂载");
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(find(groups[0].title)).toBe(active);
    expect(find(groups[1].title)).toBe(target);
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(target.textContent).toContain("截止");
    expect(mocks.filter).not.toHaveBeenCalled();
  }
  await act(async () => target.click());
  expect(mocks.filter).toHaveBeenCalledExactlyOnceWith("2");
  expect(target.getAttribute("aria-current")).toBe("page");
});
