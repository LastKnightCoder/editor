import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

/**
 * Remark 插件：处理文档引用语法
 * 将 :ref[显示文本]{contentId=123 type=card} 转换为自定义节点
 */
const remarkDocumentReference: Plugin<[], any> = () => {
  return (tree) => {
    visit(tree, "text", (node: any, index, parent) => {
      if (!parent || typeof index !== "number") return;

      const regex = /:ref\[([^\]]+)\]\{id=(\d+)\s+type=([^}]+)\}/g;
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
        const [fullMatch, displayText, id, type] = match;
        const matchStart = match.index!;
        const matchEnd = matchStart + fullMatch.length;

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
              "data-text": displayText,
            },
          },
          children: [
            {
              type: "text",
              value: displayText,
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
