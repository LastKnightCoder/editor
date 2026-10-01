/**
 * `$` 点名 Skill（D-060）：输入框里打 `$` 弹出 Skill 列表，选中后插入行内芯片；
 * 发送时 ChatInputArea 从芯片取出 folderName，随消息交给 agent 注入 SKILL.md 全文。
 * `/` 仍归编辑器的块命令面板，两者互不干扰。
 */

import type { Editor } from "slate";
import { Sparkles } from "lucide-react";
import {
  defineElement,
  defineExtension,
  type EditorCommand,
  type EditorHotkey,
  type ElementBehaviors,
  type ElementRenderProps,
} from "@tau/editor";
import type { ParagraphElement } from "@tau/editor";
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

/** 段落里输入 $ 打开 Skill 列表；列表开着时其他输入更新 query、空白关闭。文本本身交给默认行为 */
const insertText: ElementBehaviors<ParagraphElement>["insertText"] = (editor, _entry, text) => {
  if (text === "$") {
    openSkillPicker(editor);
  } else if (isPickerOpenFor(editor)) {
    if (/\s/.test(text)) closeSkillPicker();
    else useSkillPickerStore.setState(s => ({ query: s.query + text, activeIndex: 0 }));
  }
  return false;
};

/** 列表开着时退格同步缩减 query；字符删除交给默认行为 */
const deleteBackward: ElementBehaviors<ParagraphElement>["deleteBackward"] = editor => {
  if (isPickerOpenFor(editor)) {
    const { query } = useSkillPickerStore.getState();
    if (!query) closeSkillPicker();
    else useSkillPickerStore.setState({ query: query.slice(0, -1), activeIndex: 0 });
  }
  return false;
};

const skillRefForParagraph: ElementBehaviors<ParagraphElement> = {
  insertText,
  deleteBackward,
};

const pickerCommand = (
  id: string,
  title: string,
  run: (editor: Editor) => void,
  stop = false
): EditorCommand => ({
  id,
  title,
  run: (editor, ctx) => {
    if (!isPickerOpenFor(editor)) return;
    run(editor);
    ctx.event?.preventDefault();
    if (stop) ctx.event?.stopPropagation();
  },
});

export const skillPickerCommands: EditorCommand[] = [
  pickerCommand("host.skill-ref.dismiss", "关闭 Skill 列表", closeSkillPicker, true),
  pickerCommand("host.skill-ref.next", "Skill 列表下一项", () => moveSkillPickerActive(true)),
  pickerCommand("host.skill-ref.prev", "Skill 列表上一项", () => moveSkillPickerActive(false)),
  {
    id: "host.skill-ref.confirm",
    title: "Skill 列表确认",
    run: (editor, ctx) => {
      if (!isPickerOpenFor(editor)) return;
      const { items, activeIndex } = useSkillPickerStore.getState();
      const item = items[activeIndex];
      if (!item) {
        closeSkillPicker();
        return;
      }
      ctx.event?.preventDefault();
      ctx.event?.stopPropagation();
      selectSkill(item);
    },
  },
];

export const skillPickerHotkeys: EditorHotkey[] = [
  { key: "escape", command: "host.skill-ref.dismiss" },
  { key: "ArrowDown", command: "host.skill-ref.next" },
  { key: "ArrowUp", command: "host.skill-ref.prev" },
  { key: ["enter", "tab"], command: "host.skill-ref.confirm" },
];

const skillRefExtension = defineExtension({
  id: "host.skill-ref",
  elements: [
    defineElement<SkillRefElement>({
      type: "skill-ref",
      kind: "inline",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<SkillRefElement>) => (
        <span {...attributes} contentEditable={false} className="mx-px inline-block align-baseline">
          <span className="bg-accent-soft text-accent-text text-tau-sm inline-flex h-[22px] items-center gap-1 rounded-full px-2 font-medium leading-none">
            <Sparkles className="size-3" strokeWidth={2} />
            {element.name}
          </span>
          {children}
        </span>
      ),
    }),
  ],
  commands: skillPickerCommands,
  hotkeys: skillPickerHotkeys,
  behaviorsFor: {
    paragraph: skillRefForParagraph,
  },
});

export default skillRefExtension;
