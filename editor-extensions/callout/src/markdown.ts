import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import type { CalloutType } from "./variants.ts";

const DEFAULT_TITLE: Record<CalloutType, string> = {
  tip: "技巧",
  info: "信息",
  warning: "警告",
  danger: "危险",
  note: "注意",
};

const CALLOUT_TYPES: readonly CalloutType[] = ["note", "tip", "warning", "info", "danger"];

export const calloutCodec: MarkdownCodec = {
  type: "callout",
  directives: Object.fromEntries(
    CALLOUT_TYPES.map(calloutType => [
      calloutType,
      (attributes: Record<string, string | undefined>) =>
        ({
          type: "callout",
          title: attributes.title || "",
          calloutType,
          children: [],
        }) as Descendant,
    ])
  ),
  serializer: {
    isBlock: true,
    toMarkdown: (element, childrenStr) => {
      const title = element.title
        ? ` title="${element.title}"`
        : ` title=${DEFAULT_TITLE[element.calloutType as CalloutType]}`;
      const type = element.calloutType || "note";
      return `:::${type}{${title}}\n${childrenStr}\n:::`;
    },
    toMarkdownStructured: (element, childrenStr) => {
      const title = element.title
        ? ` title="${element.title}"`
        : ` title=${DEFAULT_TITLE[element.calloutType as CalloutType]}`;
      const type = element.calloutType || "note";
      return {
        output: `:::${type}{${title}}\n${childrenStr}\n:::`,
        childrenStart: { line: 1, ch: 0 },
      };
    },
  },
};
