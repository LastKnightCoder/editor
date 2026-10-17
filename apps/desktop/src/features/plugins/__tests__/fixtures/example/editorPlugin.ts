import { definePlugin, defineEditorExtension, defineEditorElement } from "@tau/plugins";
import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { reminderCodec, type PluginReminderElement } from "./reminderCodec";

import { Reminder } from "./Reminder";

export const editorPlugin = definePlugin({
  id: "example.editor",
  name: "编辑器提醒块示例",
  version: "1.0.0",
  create: () => ({
    activate(context) {
      const writable = (editor: Editor) =>
        !context.signal.aborted && !ReactEditor.isReadOnly(editor);
      const extension = defineEditorExtension({
        id: "example.editor.reminder",
        elements: [
          defineEditorElement<PluginReminderElement>({
            type: "example.editor.reminder",
            kind: "block",
            render: Reminder,
            drag: { self: true, children: true },
            isEmpty: (element, ctx) => !element.done && element.children.every(ctx.isEmpty),
          }),
        ],
        commands: [
          {
            id: "example.editor.insert",
            title: "插入插件提醒",
            when: writable,
            run(editor) {
              const path = [editor.children.length];
              Transforms.insertNodes(
                editor,
                {
                  type: "example.editor.reminder",
                  done: false,
                  children: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
                },
                { at: path }
              );
              Transforms.select(editor, Editor.start(editor, path));
            },
          },
          {
            id: "example.editor.toggle",
            when: writable,
            run(editor, { element }) {
              if (element?.type !== "example.editor.reminder") return;
              Transforms.setNodes(
                editor,
                { done: !element.done },
                { at: ReactEditor.findPath(editor, element) }
              );
            },
          },
        ],
        menu: [
          {
            id: "example.editor.toggle",
            title: "切换提醒完成状态",
            command: "example.editor.toggle",
          },
        ],
      });
      context.editor.register({ scene: "workbench", extension, codecs: [reminderCodec] });
    },
  }),
});
