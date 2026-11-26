import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { PageProvider } from "@/page/PageProvider";
import { definePage } from "@/page/definePage";
import type { Skill } from "@/types";

const state = vi.hoisted(() => ({ readme: vi.fn(), detail: vi.fn(), editors: [] as unknown[] }));
vi.mock("@/commands/skill", () => ({
  getSkillReadme: state.readme,
  getSkillDetail: state.detail,
  listSkills: async () => [],
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
  exportSkillZip: vi.fn(),
  showSkillInFolder: vi.fn(),
  inspectSkillImport: vi.fn(),
  commitSkillImport: vi.fn(),
}));
vi.mock("@/constants/internal-skills", () => ({ getAllInternalSkills: () => [] }));
vi.mock("@/services/editorKit", async () => {
  const { createEditorKit } = await import("@tau/editor");
  const { standardExtensions } = await import("@tau/editor/presets/standard");
  const kit = createEditorKit({ extensions: standardExtensions });
  return { getSkillFileKit: () => kit };
});
vi.mock("@tau/editor", async importOriginal => {
  const original = await importOriginal<typeof import("@tau/editor")>();
  const onInit = (editor: unknown) => {
    state.editors.push(editor);
  };
  return {
    ...original,
    Editor: (props: ComponentProps<typeof original.Editor>) => (
      <original.Editor {...props} onInit={onInit} />
    ),
  };
});

import { SkillDrawer } from "../views/SkillDrawer";
import { toSkillItems } from "../useSkills";

definePage({
  key: "skills-locale-test",
  match: "single",
  label: "test",
  params: {},
  component: () => null,
});

it("抽屉换语保留目标、分区和同一只读编辑器，不重取Skill或改动文件内容", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  const path = "/my-skills/original";
  const readme =
    "---\nname: original\ntitle: 用户 Skill\ndescription: 用户描述\n---\n# 用户正文\n\n保留原始内容。";
  state.readme.mockResolvedValue(readme);
  state.detail.mockResolvedValue({
    files: [
      { name: "SKILL.md", path: path + "/SKILL.md", relativePath: "SKILL.md", isDirectory: false },
    ],
  });
  state.editors.length = 0;
  const skill = {
    name: "用户 Skill",
    description: "用户描述",
    folderName: "original",
    path,
    source: "mine",
    defaultInvocation: "auto",
    fileCount: 1,
  } as Skill;
  const [item] = toSkillItems([skill], {}, {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn(),
    remove = vi.fn();
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={desktopI18n}>
          <PageProvider initialKey="skills-locale-test">
            <SkillDrawer item={item} onClose={close} onDelete={remove} />
          </PageProvider>
        </I18nRuntimeProvider>
      )
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[data-slate-editor="true"]')).not.toBeNull()
    );
    const editable = document.querySelector('[data-slate-editor="true"]');
    const editor = state.editors[0];
    expect(state.editors).toHaveLength(1);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector('[data-slate-editor="true"]')).toBe(editable);
      expect(state.editors).toEqual([editor]);
      expect(state.readme).toHaveBeenCalledExactlyOnceWith(path);
      expect(state.detail).toHaveBeenCalledExactlyOnceWith(path);
      expect(document.body.textContent).toContain("用户正文");
      expect(close).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    }
    const settings = document.querySelector<HTMLInputElement>('input[value="settings"]');
    if (!settings) throw new Error("设置分区未挂载");
    await act(async () => settings.click());
    expect(settings.checked).toBe(true);
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    expect(document.querySelector('input[value="settings"]')).toBe(settings);
    expect(settings.checked).toBe(true);
    expect(state.readme).toHaveBeenCalledTimes(1);
    expect(state.detail).toHaveBeenCalledTimes(1);
    expect(skill).toMatchObject({
      path,
      name: "用户 Skill",
      description: "用户描述",
      folderName: "original",
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(originalLocale);
    vi.restoreAllMocks();
  }
});
