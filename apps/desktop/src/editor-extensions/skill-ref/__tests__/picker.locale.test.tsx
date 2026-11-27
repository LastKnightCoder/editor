import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Transforms } from "slate";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import useSkillStore from "@/stores/useSkillStore";
import skillRefExtension from "..";
import { SkillPickerPanel } from "../SkillPickerPanel";
import { closeSkillPicker, useSkillPickerStore } from "../store";

vi.mock("@/commands/skill", () => ({
  listSkills: vi.fn(async () => []),
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));
vi.mock("@/constants/internal-skills", () => ({ getAllInternalSkills: () => [] }));

it("Skill候选换语保持原查询与编辑器选区，只在点名时插入原身份及名称", async () => {
  const locale = desktopLocaleSource.getSnapshot();
  const previous = useSkillStore.getState();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const ref = createRef<EditorRef>(),
    composer = createRef<HTMLDivElement>();
  const kit = createEditorKit({ extensions: [skillRefExtension] });
  const skill = {
    folderName: "user-folder",
    name: "用户Skill 原名",
    description: "用户原始说明",
    path: "/skills/user-folder",
    source: "mine" as const,
    defaultInvocation: "manual" as const,
  };
  useSkillStore.setState({ skills: [skill], preferences: {}, usage: {}, loaded: true });
  const load = vi.spyOn(useSkillStore.getState(), "loadSkills");
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <div ref={composer}>
            <Editor
              ref={ref}
              kit={kit}
              initValue={[
                { type: "paragraph", children: [{ type: "formatted", text: "原消息 " }] },
              ]}
            />
            <SkillPickerPanel composerRef={composer} />
          </div>
        </DndProvider>
      )
    );
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("Editor unavailable");
    await act(async () => {
      Transforms.select(editor, SlateEditor.end(editor, []));
      editor.insertText("$");
      editor.insertText("user");
    });
    const state = useSkillPickerStore.getState();
    const panel = document.querySelector('[role="listbox"]');
    if (!panel) throw new Error("Skill suggestions unavailable");
    const option = panel.querySelector<HTMLElement>('[role="option"]');
    if (!option) throw new Error("Skill candidate unavailable");
    const nodes = editor.children,
      selection = structuredClone(editor.selection);
    for (const language of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(language));
      expect(ref.current?.getEditor()).toBe(editor);
      expect(document.querySelector('[role="listbox"]')).toBe(panel);
      expect(panel.querySelector('[role="option"]')).toBe(option);
      expect(useSkillPickerStore.getState()).toBe(state);
      expect(editor.children).toBe(nodes);
      expect(editor.selection).toEqual(selection);
      expect(useSkillStore.getState().skills[0]).toBe(skill);
      expect(load).not.toHaveBeenCalled();
    }
    await act(async () => option.click());
    expect(useSkillPickerStore.getState().editor).toBeNull();
    expect(
      [
        ...SlateEditor.nodes(editor, {
          at: [],
          match: node => "type" in node && node.type === "skill-ref",
        }),
      ].map(([node]) => node)
    ).toEqual([
      {
        type: "skill-ref",
        folderName: "user-folder",
        name: "用户Skill 原名",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
    expect(SlateEditor.string(editor, [])).toBe("原消息  ");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    closeSkillPicker();
    load.mockRestore();
    useSkillStore.setState(previous);
    desktopLocaleSource.setLocale(locale);
  }
});
