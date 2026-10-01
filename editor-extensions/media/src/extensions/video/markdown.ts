import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const videoCodec: MarkdownCodec = {
  type: "video",
  isVoid: true,
  directives: {
    video: attributes => {
      const element = {
        type: "video",
        src: attributes.src || "",
        uploading: false,
        children: [{ type: "formatted", text: "" }],
      } as Record<string, unknown>;
      if (attributes.playbackRate) element.playbackRate = parseFloat(attributes.playbackRate);
      if (attributes.metaInfo) {
        try {
          // 与 toMarkdown 的 UTF-8 编码对称，metaInfo 里的中文标题才能往返
          element.metaInfo = JSON.parse(decodeURIComponent(escape(atob(attributes.metaInfo))));
        } catch {
          // ignore invalid metaInfo
        }
      }
      if (attributes.width) element.width = parseInt(attributes.width);
      if (attributes.align) element.align = attributes.align;
      return element as unknown as Descendant;
    },
  },
  serializer: {
    isBlock: true,
    toMarkdown: element => {
      const attributes: string[] = [];
      attributes.push(`src="${element.src}"`);
      if (element.playbackRate) attributes.push(`playbackRate="${element.playbackRate}"`);
      if (element.metaInfo) {
        const metaInfoStr = btoa(unescape(encodeURIComponent(JSON.stringify(element.metaInfo))));
        attributes.push(`metaInfo="${metaInfoStr}"`);
      }
      if (element.width) attributes.push(`width="${element.width}"`);
      if (element.align) attributes.push(`align="${element.align}"`);
      const attributeStr = attributes.length > 0 ? attributes.join(" ") : "";
      return `:::video{${attributeStr}}\n:::`;
    },
  },
};
