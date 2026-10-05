import { visit } from "unist-util-visit";
import { parseContentLinkAttributes } from "./chat-mentions";

/**
 * Remark 插件：处理文档引用语法
 * 将 :ref[显示文本]{id=123 type=card} 转换为自定义节点
 * :ref 可带 block=N（AI 检索命中节的顶层块序号），输出 data-block 供宿主打开到该块；不认识的宿主忽略即可
 */
const remarkDocumentReference = () => {
  return (tree: any) => {
    visit(tree, "text", (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== "number") return;

      const regex = /:(ref|content-link)\[([^\]]+)\]\{([^}]+)\}/g;
      const text = node.value;

      // 手动收集所有匹配项
      const matches: RegExpExecArray[] = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push(match);
      }

      if (matches.length === 0) return;

      // 创建新的节点数组来替换当前文本节点
      const newNodes: any[] = [];
      let lastIndex = 0;

      matches.forEach((match) => {
        const [fullMatch, directiveName, displayText, rawAttributes] = match;
        const matchStart = match.index!;
        const matchEnd = matchStart + fullMatch.length;
        const attributes = parseContentLinkAttributes(rawAttributes);
        const id =
          directiveName === "content-link"
            ? attributes.refId || attributes.contentId || "0"
            : attributes.id || attributes.refId || attributes.contentId || "0";
        const type =
          directiveName === "content-link"
            ? attributes.contentType || attributes.type || ""
            : attributes.type || attributes.contentType || "";
        const textValue = attributes.title || displayText;
        const block =
          directiveName === "ref" && /^\d+$/.test(attributes.block ?? "")
            ? Number(attributes.block)
            : undefined;

        // 添加匹配前的文本
        if (matchStart > lastIndex) {
          const beforeText = text.slice(lastIndex, matchStart);
          if (beforeText) {
            newNodes.push({
              type: "text",
              value: beforeText,
            });
          }
        }

        // 添加文档引用节点
        newNodes.push({
          type: "documentReference",
          data: {
            hName: "span",
            hProperties: {
              className: "document-reference",
              "data-id": id,
              "data-type": type,
              "data-text": textValue,
              ...(block !== undefined ? { "data-block": block } : {}),
            },
          },
          children: [
            {
              type: "text",
              value: textValue,
            },
          ],
        });

        lastIndex = matchEnd;
      });

      // 添加剩余的文本
      if (lastIndex < text.length) {
        const afterText = text.slice(lastIndex);
        if (afterText) {
          newNodes.push({
            type: "text",
            value: afterText,
          });
        }
      }

      // 用新节点替换当前节点
      parent.children.splice(index, 1, ...newNodes);
    });
  };
};

export default remarkDocumentReference;
