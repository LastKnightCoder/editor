import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const chartCodec: MarkdownCodec = {
  type: "chart",
  directives: {
    chart: attributes => {
      try {
        const data = JSON.parse(atob(attributes.data || "W10="));
        const config = JSON.parse(atob(attributes.config || "e30="));
        return {
          type: "chart",
          data,
          config,
          children: [{ type: "formatted", text: "" }],
        } as unknown as Descendant;
      } catch {
        return null;
      }
    },
  },
  serializer: {
    isBlock: true,
    toMarkdown: element => {
      const dataStr = btoa(unescape(encodeURIComponent(JSON.stringify(element.data))));
      const configStr = btoa(unescape(encodeURIComponent(JSON.stringify(element.config))));
      return `:::chart{data="${dataStr}" config="${configStr}"}\n:::`;
    },
  },
};
