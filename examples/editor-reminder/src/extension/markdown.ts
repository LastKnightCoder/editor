import type { MarkdownCodec } from "@tau/markdown";
import type { ReminderElement } from "./model.ts";

const wrap = (done: boolean, children: string) =>
  `:::example-reminder{done=${done}}\n${children}\n:::`;

export const reminderCodec: MarkdownCodec = {
  type: "example.reminder",
  directives: {
    "example-reminder": attributes =>
      ({
        type: "example.reminder",
        done: attributes.done === "true",
        children: [],
      }) satisfies ReminderElement,
  },
  serializer: {
    isBlock: true,
    toMarkdown: (element, children) => wrap(element.done === true, children),
    toMarkdownStructured: (element, children) => ({
      output: wrap(element.done === true, children),
      childrenStart: { line: 1, ch: 0 },
    }),
  },
};
