import type {} from "./augmentations";
import { Transforms, type Editor } from "slate";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import {
  createParagraph,
  defineElement,
  defineExtension,
  exitContainerOnEmptyParagraph,
  getCommandElementPath,
  setOrInsertNode,
  type ElementRenderProps,
} from "@tau/editor/api";
import type { ReminderElement } from "./model";

export type { ReminderElement } from "./model";

export function createReminder(): ReminderElement {
  return { type: "example.reminder", done: false, children: [createParagraph()] };
}

export function insertReminder(editor: Editor): void {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  setOrInsertNode(editor, createReminder(), { select: true });
}

function Reminder({ attributes, element, children }: ElementRenderProps<ReminderElement>) {
  const editor = useSlateStatic();
  const readonly = useReadOnly();
  return (
    <div
      {...attributes}
      data-reminder
      data-done={element.done}
      className="my-3 rounded-lg border border-[var(--ed-border)] p-4"
    >
      <div
        contentEditable={false}
        className="mb-2 flex items-center gap-2 text-sm text-[var(--ed-text-secondary)]"
      >
        <button
          type="button"
          disabled={readonly}
          aria-pressed={element.done}
          className="rounded border border-[var(--ed-border)] px-2 py-1 disabled:opacity-50"
          onMouseDown={event => event.preventDefault()}
          onClick={() => editor.commands?.execute("example.reminder.toggle", undefined, element)}
        >
          {element.done ? "已完成" : "标记完成"}
        </button>
        <span>提醒</span>
      </div>
      {children}
    </div>
  );
}

export const reminderExtension = defineExtension({
  id: "example.reminder",
  elements: [
    defineElement<ReminderElement>({
      type: "example.reminder",
      kind: "block",
      render: Reminder,
      drag: { self: true, children: true },
      isEmpty: (element, context) => !element.done && element.children.every(context.isEmpty),
      copy: ({ fullySelected }) => (fullySelected ? "keep" : "unwrap"),
      behaviors: {
        normalize: (editor, [element, path]) => {
          if (element.children.length) return false;
          Transforms.insertNodes(editor, createParagraph(), { at: [...path, 0] });
          return true;
        },
        insertBreak: editor => exitContainerOnEmptyParagraph(editor, "example.reminder"),
      },
    }),
  ],
  commands: [
    { id: "example.reminder.insert", title: "插入提醒", run: insertReminder },
    {
      id: "example.reminder.toggle",
      title: "切换提醒状态",
      run: (editor, context) => {
        if (context.element?.type !== "example.reminder") return;
        const path = getCommandElementPath(editor, context);
        if (!path) return;
        Transforms.setNodes(editor, { done: !context.element.done }, { at: path });
      },
    },
  ],
  menu: [
    {
      id: "example.reminder.toggle",
      title: context =>
        context.element.type === "example.reminder" && context.element.done
          ? "提醒：恢复待办"
          : "提醒：标记完成",
      command: "example.reminder.toggle",
    },
  ],
});
