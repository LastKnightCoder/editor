import type { EditorElementRenderProps } from "@tau/plugins";
import { Button } from "@tau/ui";
import { useReadOnly, useSlateStatic } from "slate-react";
import type { PluginReminderElement } from "./reminderCodec";

export function Reminder({
  attributes,
  element,
  children,
}: EditorElementRenderProps<PluginReminderElement>) {
  const editor = useSlateStatic();
  const readonly = useReadOnly();
  return (
    <div
      {...attributes}
      data-plugin-reminder
      data-done={element.done}
      className="border-line-1 rounded-tau-md my-3 border p-3"
    >
      <div contentEditable={false} className="mb-2">
        <Button
          disabled={readonly}
          onMouseDown={event => event.preventDefault()}
          onClick={() => editor.commands?.execute("example.editor.toggle", undefined, element)}
        >
          {element.done ? "提醒已完成" : "完成提醒"}
        </Button>
      </div>
      {children}
    </div>
  );
}
