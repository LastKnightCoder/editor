import type { EditorMarkdownCodec } from "@tau/plugins";
import type { Element } from "slate";

export interface PluginReminderElement {
  type: "example.editor.reminder";
  done: boolean;
  children: Element[];
}

declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.editor.reminder": PluginReminderElement;
  }
}

export const reminderCodec: EditorMarkdownCodec = {
  type: "example.editor.reminder",
  directives: {
    "plugin-reminder": attributes => ({
      type: "example.editor.reminder",
      done: attributes.done === "true",
      children: [],
    }),
  },
  serializer: {
    isBlock: true,
    toMarkdown: (element, children) =>
      `:::plugin-reminder{done=${element.done === true}}\n${children}\n:::`,
  },
};
