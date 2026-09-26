/**
 * `$` 点名 Skill（D-060）：输入框里打 `$` 弹出 Skill 列表，选中后插入行内芯片；
 * 发送时 ChatInputArea 从芯片取出 folderName，随消息交给 agent 注入 SKILL.md 全文。
 * `/` 仍归编辑器的块命令面板，两者互不干扰。
 */

import { Editor } from "slate";
import type { RenderElementProps } from "slate-react";
import { Sparkles } from "lucide-react";
import {
  Base,
  createInlineElementPlugin,
  createVoidElementPlugin,
  type IExtension,
  type IHotKeyConfig,
} from "@tau/editor/src";
import type { SkillRefElement } from "./types";
import {
  closeSkillPicker,
  isPickerOpenFor,
  moveSkillPickerActive,
  openSkillPicker,
  selectSkill,
  useSkillPickerStore,
} from "./store";

export type { SkillRefElement } from "./types";

const withSkillTrigger = (editor: Editor) => {
  const { insertText, deleteBackward } = editor;

  editor.insertText = text => {
    if (text === "$") {
      openSkillPicker(editor);
    } else if (isPickerOpenFor(editor)) {
      if (/\s/.test(text)) closeSkillPicker();
      else useSkillPickerStore.setState(s => ({ query: s.query + text, activeIndex: 0 }));
    }
    insertText(text);
  };

  editor.deleteBackward = unit => {
    if (isPickerOpenFor(editor)) {
      const { query } = useSkillPickerStore.getState();
      if (!query) closeSkillPicker();
      else useSkillPickerStore.setState({ query: query.slice(0, -1), activeIndex: 0 });
    }
    deleteBackward(unit);
  };

  return editor;
};

const pickerHotkeys: IHotKeyConfig[] = [
  {
    hotKey: "esc",
    action: (editor, event) => {
      if (!isPickerOpenFor(editor)) return;
      closeSkillPicker();
      event.preventDefault();
      event.stopPropagation();
    },
  },
  {
    hotKey: "down",
    action: (editor, event) => {
      if (!isPickerOpenFor(editor)) return;
      moveSkillPickerActive(true);
      event.preventDefault();
    },
  },
  {
    hotKey: "up",
    action: (editor, event) => {
      if (!isPickerOpenFor(editor)) return;
      moveSkillPickerActive(false);
      event.preventDefault();
    },
  },
  {
    hotKey: ["enter", "tab"],
    action: (editor, event) => {
      if (!isPickerOpenFor(editor)) return;
      const { items, activeIndex } = useSkillPickerStore.getState();
      const item = items[activeIndex];
      if (!item) {
        closeSkillPicker();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      selectSkill(item);
    },
  },
];

class SkillRefExtension extends Base implements IExtension {
  type = "skill-ref";

  override getPlugins() {
    return [
      createInlineElementPlugin("skill-ref"),
      createVoidElementPlugin("skill-ref"),
      withSkillTrigger,
    ];
  }

  override getHotkeyConfigs() {
    return pickerHotkeys;
  }

  render({ attributes, children, element }: RenderElementProps) {
    const skill = element as unknown as SkillRefElement;
    return (
      <span {...attributes} contentEditable={false} className="mx-px inline-block align-baseline">
        <span className="bg-accent-soft text-accent-text text-tau-sm inline-flex h-[22px] items-center gap-1 rounded-full px-2 font-medium leading-none">
          <Sparkles className="size-3" strokeWidth={2} />
          {skill.name}
        </span>
        {children}
      </span>
    );
  }
}

export default SkillRefExtension;
