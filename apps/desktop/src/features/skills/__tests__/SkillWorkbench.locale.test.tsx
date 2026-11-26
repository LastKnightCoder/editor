import { act, useState, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { PageParamsProvider, PageProvider } from "@/page/PageProvider";
import { definePage } from "@/page/definePage";
import type { PiChatOptions, PiChatResult } from "@/services/piLLM";
import type { Skill, SkillDetail } from "@/types";

const io = vi.hoisted(() => ({
  detail: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  create: vi.fn(),
  inspect: vi.fn(),
  commit: vi.fn(),
  discard: vi.fn(),
  pickFile: vi.fn(),
  stream: vi.fn(),
  cancel: vi.fn(),
  editors: [] as unknown[],
}));
vi.mock("@/commands/skill", () => ({
  getSkillDetail: io.detail,
  readSkillFile: io.read,
  writeSkillFile: io.write,
  listSkills: async () => [],
  createSkill: io.create,
  inspectSkillImport: io.inspect,
  commitSkillImport: io.commit,
  discardSkillImport: io.discard,
  getLinkedSkillDirs: async () => [],
  setLinkedSkillDirs: vi.fn(),
  createSkillEntry: vi.fn(),
  deleteSkillEntry: vi.fn(),
  renameSkillEntry: vi.fn(),
  deleteSkill: vi.fn(),
  exportSkillZip: vi.fn(),
  showSkillInFolder: vi.fn(),
}));
vi.mock("@/commands/file", () => ({ selectFile: io.pickFile }));
vi.mock("@/commands/extra", () => ({ selectDirectoryWithDialog: vi.fn() }));
vi.mock("@/constants/internal-skills", () => ({ getAllInternalSkills: () => [] }));
vi.mock("@/hooks/useLLMConfig", () => ({
  default: () => ({ provider: { id: "provider" }, model: { id: "model" } }),
}));
vi.mock("@/services/piLLM", () => ({ piStreamText: io.stream }));
vi.mock("@/services/editorKit", async () => {
  const { createEditorKit } = await import("@tau/editor");
  const { standardExtensions } = await import("@tau/editor/presets/standard");
  const kit = createEditorKit({ extensions: standardExtensions });
  return { getSkillFileKit: () => kit };
});
vi.mock("@tau/editor", async importOriginal => {
  const original = await importOriginal<typeof import("@tau/editor")>();
  const onInit = (editor: unknown) => {
    io.editors.push(editor);
  };
  return {
    ...original,
    Editor: (props: ComponentProps<typeof original.Editor>) => (
      <original.Editor {...props} onInit={onInit} />
    ),
  };
});

import { SkillEditView } from "../views/SkillEditView";
import { AddSkillDialog, type AddSkillTab } from "../views/AddSkillDialog";
import { skillWorkbenchTranslator as tr } from "../workbench-i18n";
import useSkillStore from "@/stores/useSkillStore";
import { importFromMarkdown } from "@/utils/markdown";
import { splitSkillDocument } from "@/utils/skill-frontmatter";

definePage({
  key: "skill-workbench-locale",
  match: "single",
  label: "test",
  params: {},
  component: () => null,
});
const path = "/skills/user-folder";
const readme =
  "---\nname: user-folder\ntitle: 用户标题\ndescription: 用户描述\n---\n# 原始正文\n\n保留用户写的内容。\n";
const skill = {
  path,
  name: "用户标题",
  folderName: "user-folder",
  description: "用户描述",
  source: "mine",
  defaultInvocation: "auto",
  fileCount: 2,
} as Skill;
let cleanup: (() => Promise<void>) | undefined;
let originalLocale: string;
beforeEach(() => {
  originalLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  vi.clearAllMocks();
  io.editors.length = 0;
  useSkillStore.setState({ skills: [skill], preferences: {}, usage: {} });
});
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  desktopLocaleSource.setLocale(originalLocale);
});
async function mount(children: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <PageProvider initialKey="skill-workbench-locale">
          <PageParamsProvider value={{ path }}>{children}</PageParamsProvider>
        </PageProvider>
      </I18nRuntimeProvider>
    )
  );
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  return host;
}
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected mounted control");
  return value;
}
function button(key: Parameters<typeof tr.t>[0], within: ParentNode = document): HTMLButtonElement {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
    item =>
      item.textContent?.trim() === tr.t(key) || item.querySelector("b")?.textContent === tr.t(key)
  );
  if (!found) throw new Error(`Missing action ${key}`);
  return found;
}
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    required(Object.getOwnPropertyDescriptor(prototype, "value")?.set).call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function Add({ initial }: { initial: AddSkillTab }) {
  const [tab, setTab] = useState<AddSkillTab | null>(initial);
  return <AddSkillDialog tab={tab} onTabChange={setTab} />;
}

it("编辑字段与未保存的离开确认换语后保留草稿、目标和同一编辑器，不重读或保存", async () => {
  io.detail.mockResolvedValue({
    ...skill,
    files: [
      {
        name: "SKILL.md",
        path: `${path}/SKILL.md`,
        relativePath: "SKILL.md",
        isDirectory: false,
        isMarkdown: true,
      },
      {
        name: "notes.md",
        path: `${path}/notes.md`,
        relativePath: "notes.md",
        isDirectory: false,
        isMarkdown: true,
      },
    ],
  } as SkillDetail);
  io.read.mockResolvedValue(readme);
  const host = await mount(<SkillEditView />);
  await vi.waitFor(() => expect(host.querySelector('[data-slate-editor="true"]')).not.toBeNull());
  const editable = host.querySelector('[data-slate-editor="true"]'),
    editor = io.editors[0];
  const title = required(host.querySelector<HTMLInputElement>('input[placeholder="user-folder"]'));
  await input(title, "改过的用户标题");
  title.focus();
  title.setSelectionRange(2, 4);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector('input[placeholder="user-folder"]')).toBe(title);
    expect(title.value).toBe("改过的用户标题");
    expect([title.selectionStart, title.selectionEnd]).toEqual([2, 4]);
    expect(host.querySelector('[data-slate-editor="true"]')).toBe(editable);
    expect(io.editors).toEqual([editor]);
    expect(io.detail).toHaveBeenCalledExactlyOnceWith(path);
    expect(io.read).toHaveBeenCalledExactlyOnceWith(`${path}/SKILL.md`);
    expect(io.write).not.toHaveBeenCalled();
  }
  const target = required(
    [...host.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(row =>
      row.textContent?.includes("notes.md")
    )
  );
  await act(async () => target.click());
  const dialog = required(document.querySelector('[role="dialog"]'));
  await act(async () => desktopLocaleSource.setLocale("zh-CN"));
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  expect(io.read).toHaveBeenCalledTimes(1);
  await act(async () => button("workbench.cancel", dialog).click());
  expect(title.value).toBe("改过的用户标题");
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }))
  );
  await vi.waitFor(() => expect(io.write).toHaveBeenCalledTimes(1));
  const [savedPath, content] = io.write.mock.calls[0];
  expect(savedPath).toBe(`${path}/SKILL.md`);
  const saved = splitSkillDocument(content);
  expect(saved.meta).toMatchObject({
    name: "user-folder",
    title: "改过的用户标题",
    description: "用户描述",
  });
  expect(importFromMarkdown(saved.body)).toEqual(
    importFromMarkdown(splitSkillDocument(readme).body)
  );
});

it("AI起草换语保留输入与原流任务，继续接收正文且不取消或重复请求", async () => {
  let emit!: (update: { text: string }) => void, finish!: (result: PiChatResult) => void;
  const result = new Promise<PiChatResult>(resolve => {
    finish = resolve;
  });
  io.stream.mockImplementation((_request: PiChatOptions, callback: typeof emit) => {
    emit = callback;
    return { result, cancel: io.cancel };
  });
  await mount(<Add initial="ai" />);
  const prompt = required(document.querySelector<HTMLTextAreaElement>("textarea"));
  await input(prompt, "原始用户请求 $custom");
  await act(async () => button("workbench.draft").click());
  await act(async () => emit({ text: "# 生成的用户正文" }));
  const preview = document.querySelector("pre");
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("textarea")).toBe(prompt);
    expect(prompt.value).toBe("原始用户请求 $custom");
    expect(document.querySelector("pre")).toBe(preview);
    expect(preview?.textContent).toBe("# 生成的用户正文");
    expect(io.stream).toHaveBeenCalledTimes(1);
    expect(io.cancel).not.toHaveBeenCalled();
  }
  await act(async () => {
    emit({ text: "# 完成的用户正文" });
    finish({ ok: true, aborted: false, text: "# 完成的用户正文", reasoning: "", message: null });
  });
  expect(preview?.textContent).toBe("# 完成的用户正文");
  const request = io.stream.mock.calls[0][0] as PiChatOptions;
  expect(request.messages[1].content).toEqual([{ type: "text", text: "原始用户请求 $custom" }]);
  expect(request.source).toMatchObject({ feature: "skillDraft" });
  expect(button("workbench.saveSkill").disabled).toBe(false);
  expect(io.create).not.toHaveBeenCalled();
});

it("导入候选换语保留原token和勾选项，不重复扫描或丢弃任务", async () => {
  io.pickFile.mockResolvedValue(["/downloads/user.skill"]);
  io.inspect.mockResolvedValue({
    token: "original-inspection",
    candidates: [
      {
        relPath: "one",
        name: "原始名称一",
        description: "原始描述一",
        fileCount: 2,
        exists: false,
      },
      { relPath: "two", name: "原始名称二", description: "原始描述二", fileCount: 1, exists: true },
    ],
  });
  io.commit.mockResolvedValue([]);
  await mount(<Add initial="import" />);
  await act(async () => button("workbench.chooseArchive").click());
  await vi.waitFor(() =>
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0)
  );
  const checkboxes = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  await act(async () => checkboxes[1].click());
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect([...document.querySelectorAll('input[type="checkbox"]')]).toEqual(checkboxes);
    expect(checkboxes.map(item => item.checked)).toEqual([true, false]);
    expect(io.inspect).toHaveBeenCalledExactlyOnceWith({
      type: "zip",
      path: "/downloads/user.skill",
    });
    expect(io.discard).not.toHaveBeenCalled();
    expect(io.commit).not.toHaveBeenCalled();
  }
  const commit = required(
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      item => item.textContent?.trim() === tr.t("workbench.importCount", { count: 1 })
    )
  );
  await act(async () => commit.click());
  expect(io.commit).toHaveBeenCalledExactlyOnceWith("original-inspection", [
    { relPath: "one", overwrite: false },
  ]);
});

it("已有的缺失Skill错误换语只刷新反馈，不重新读取或尝试打开文件", async () => {
  io.detail.mockResolvedValue(null);
  const host = await mount(<SkillEditView />);
  await vi.waitFor(() => expect(host.querySelector("p")).not.toBeNull());
  const failure = required(host.querySelector("p"));
  let previous = failure.textContent;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("p")).toBe(failure);
    expect(failure.textContent).not.toBe(previous);
    previous = failure.textContent;
    expect(io.detail).toHaveBeenCalledExactlyOnceWith(path);
    expect(io.read).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
  }
});
