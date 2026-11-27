import type { MindmapAgentCandidate } from "./mindmap-agent";
import type { Operation } from "./mindmap-agent-utils";
import type { ContentNode, WhiteboardElementSnapshot } from "@tau/collaboration";
import {
  mindKeys,
  mindError,
  mindString,
  mindInteger,
  mindObject,
  mindBoolean,
} from "../../../../shared/whiteboard-mindmap";
import { plainText } from "./mindmap-agent-utils";

export function editMindText(
  ctx: MindmapAgentCandidate,
  op: Operation,
  supplied?: WhiteboardElementSnapshot
) {
  mindKeys(
    op,
    [
      "kind",
      "id",
      "text",
      "blockId",
      "offset",
      "remove",
      "length",
      "marks",
      "content",
      "markdown",
      "url",
    ],
    "operation"
  );
  const node = supplied ?? ctx.textTarget(op.id);
  ctx.guard(node.id, "text");
  const formats = ["text", "content", "markdown"].filter(key => op[key] !== undefined);
  if (formats.length > 1)
    mindError("AMBIGUOUS_CONTENT", "text、content、markdown 只能提供一项", { actual: formats });
  const tree = ctx.model.richText(node.id);
  if (op.content !== undefined || op.markdown !== undefined) {
    if (
      ["blockId", "offset", "remove", "length", "marks", "url"].some(key => op[key] !== undefined)
    )
      mindError("AMBIGUOUS_CONTENT", "整体替换正文不能同时指定局部范围、格式或链接", {
        path: "content",
      });
    const body = ctx.body(op.content ?? op.markdown, op.markdown !== undefined);
    const all: string[] = [];
    const collect = (nodes: ContentNode[]) =>
      nodes.forEach(value => {
        if (typeof value.collabId === "string") all.push(value.collabId);
        if (value.children) collect(value.children);
      });
    collect(tree.read());
    if (all.length) tree.removeNodes(all, "agent");
    body.forEach((value, index) => tree.insertNode(value, null, index, "agent"));
    return;
  }
  const targets: ContentNode[] = [];
  const walk = (nodes: ContentNode[]) =>
    nodes.forEach(value => {
      if (
        typeof value.collabId === "string" &&
        value.children?.every(child => typeof child.text === "string")
      )
        targets.push(value);
      else if (value.children) walk(value.children);
    });
  walk(tree.read());
  const target =
    op.blockId === undefined
      ? targets.length === 1
        ? targets[0]
        : undefined
      : targets.find(value => value.collabId === op.blockId);
  if (!target || typeof target.collabId !== "string")
    mindError("TEXT_TARGET_REQUIRED", "无法唯一确定文字编辑目标", {
      path: "blockId",
      elementIds: [node.id],
      expected: targets.map(value => ({
        blockId: value.collabId,
        type: value.type,
        text: plainText(value.children ?? []),
      })),
      actual: op.blockId ?? null,
      suggestion:
        "从读取结果的 content 中选择准确的 blockId；若确实要整体重写节点，显式提供 content 或 markdown。",
    });
  if (op.url !== undefined) {
    if (target.type !== "link")
      mindError("NOT_A_LINK", "url 只能用于现有 link 正文元素", {
        path: "blockId",
        actual: target.type,
      });
    const url = mindString(op.url, "url", 8192);
    if (!/^(https?:|mailto:)/i.test(url))
      mindError("INVALID_URL", "链接仅支持 http、https 或 mailto", { path: "url", actual: url });
    tree.setProperties(target.collabId, { url }, "agent");
  }
  const old = plainText(target.children ?? []);
  let offset = op.offset === undefined ? 0 : mindInteger(op.offset, "offset", 0, old.length);
  let remove =
    op.remove === undefined
      ? op.offset === undefined && op.text !== undefined
        ? old.length
        : 0
      : mindInteger(op.remove, "remove", 0, old.length - offset);
  let text = op.text === undefined ? "" : mindString(op.text, "text");
  const marksOffset = offset;
  const editedLength = old.length - remove + text.length;
  const defaultMarksLength = op.text !== undefined ? text.length : old.length - offset;
  if (op.length !== undefined && op.marks === undefined)
    mindError("INVALID_TEXT_RANGE", "length 只用于 marks 的格式范围", {
      path: "length",
      suggestion: "格式修改使用 offset、length、marks；文字删除使用 offset、remove。",
    });
  if (op.marks !== undefined && remove > 0 && op.text === undefined)
    mindError("AMBIGUOUS_TEXT_OPERATION", "格式范围不能用 remove 指定，remove 会删除文字", {
      path: "remove",
      actual: remove,
      suggestion:
        "只改格式请使用 offset、length、marks，不传 remove；删除与格式修改可拆成两个明确操作。",
    });
  if (op.text !== undefined && op.offset === undefined && op.remove === undefined) {
    let prefix = 0,
      suffix = 0;
    while (prefix < old.length && prefix < text.length && old[prefix] === text[prefix]) prefix++;
    while (
      suffix < old.length - prefix &&
      suffix < text.length - prefix &&
      old[old.length - 1 - suffix] === text[text.length - 1 - suffix]
    )
      suffix++;
    offset = prefix;
    remove = old.length - prefix - suffix;
    text = text.slice(prefix, text.length - suffix);
  }
  let replacementMarks: Record<string, unknown> | undefined;
  if (remove && text) {
    let end = 0;
    for (const leaf of target.children ?? []) {
      end += typeof leaf.text === "string" ? leaf.text.length : 0;
      if (offset < end) {
        const marks = { ...leaf };
        delete marks.text;
        replacementMarks = marks;
        break;
      }
    }
  }
  if (remove) tree.deleteText(target.collabId, offset, remove, "agent");
  if (text) tree.insertText(target.collabId, offset, text, "agent", replacementMarks);
  if (op.marks !== undefined) {
    const marks = mindObject(op.marks, "marks");
    mindKeys(
      marks,
      [
        "bold",
        "italic",
        "underline",
        "strikethrough",
        "code",
        "color",
        "backgroundColor",
        "fontSize",
        "fontFamily",
      ],
      "marks"
    );
    for (const [key, value] of Object.entries(marks)) {
      if (value === null) continue;
      if (["bold", "italic", "underline", "strikethrough", "code"].includes(key))
        mindBoolean(value, `marks.${key}`);
      else if (key === "fontSize") {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 512)
          mindError("INVALID_FONT_SIZE", "字号必须是大于 0 且不超过 512 的数值", {
            path: "marks.fontSize",
            expected: { exclusiveMinimum: 0, maximum: 512 },
            actual: value,
          });
      } else mindString(value, `marks.${key}`, 128);
    }
    const length =
      op.length === undefined
        ? defaultMarksLength
        : mindInteger(op.length, "length", 0, editedLength - marksOffset);
    tree.formatText(target.collabId, marksOffset, length, marks, "agent");
  }
  if (
    op.text === undefined &&
    op.remove === undefined &&
    op.marks === undefined &&
    op.url === undefined
  )
    mindError("EMPTY_EDIT", "没有提供文字、删除长度、格式或链接修改", { path: "text" });
}
