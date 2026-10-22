/**
 * 正文输入：新建内容与修改正文时统一使用。宿主写入前校验结构；节点类型不做白名单，
 * 未注册的类型与编辑器对缺包节点的处理一致，原样保存。
 */
import type { Descendant } from "slate";
import type { PluginContentRef } from "./data";
import { copyJson } from "./values";

/** 编辑器节点结构的版本：节点形状有不兼容变化时递增，随 nodes 格式的正文快照返回 */
export const EDITOR_NODE_SCHEMA_VERSION = 1;

export type PluginContentInput =
  /** Markdown，宿主转换为节点；Markdown 表达不了的格式会丢失 */
  | { markdown: string }
  /** 编辑器节点，原样写入，与 content.read 的 nodes 格式相同 */
  | { nodes: Descendant[] }
  /** 整份复制一份已有正文：只需要目标的写入权限，插件拿不到正文 */
  | { copyOf: PluginContentRef }
  /**
   * 与本插件的一项内容共用同一份正文，任一处的修改在另一处实时可见；只能用于新建卡片、文章、
   * 项目文档与「插入到项目」。删除其中一处不影响另一处。
   */
  | { shareOf: PluginContentRef };

export const CONTENT_INPUT_LIMITS = Object.freeze({
  markdown: 2_000_000,
  /** 节点序列化为 JSON 后的字符数 */
  nodes: 8_000_000,
  /** 节点层级；每层节点占 copyJson 两层（对象与 children），与其 64 层上限对齐 */
  depth: 30,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 节点结构校验：顶层为元素；元素有 type 与非空 children；文本节点有 text、没有 children。 */
export function assertContentNodes(value: unknown): asserts value is Descendant[] {
  if (!Array.isArray(value)) throw new Error("正文节点必须是数组");
  const visit = (node: unknown, path: number[], block: boolean) => {
    const where = `正文节点无效（路径 ${path.join(".")}）：`;
    if (path.length > CONTENT_INPUT_LIMITS.depth) throw new Error(`${where}嵌套过深`);
    if (!isRecord(node)) throw new Error(`${where}必须是对象`);
    if ("text" in node) {
      if (block) throw new Error(`${where}顶层必须是元素`);
      if (typeof node.text !== "string") throw new Error(`${where}text 必须是字符串`);
      if ("children" in node) throw new Error(`${where}文本节点不能有 children`);
      return;
    }
    if (typeof node.type !== "string" || !node.type || node.type.length > 200)
      throw new Error(`${where}元素缺少 type`);
    if (!Array.isArray(node.children) || !node.children.length)
      throw new Error(`${where}元素的 children 必须是非空数组`);
    node.children.forEach((child, index) => visit(child, [...path, index], false));
  };
  value.forEach((node, index) => visit(node, [index], true));
}

const isEmptyInput = (input: PluginContentInput) =>
  "markdown" in input ? !input.markdown.trim() : "nodes" in input ? !input.nodes.length : false;

const readRef = (value: unknown, label: string): PluginContentRef => {
  if (typeof value !== "string" || !value || value.length > 200)
    throw new Error(`${label} 正文引用无效`);
  return value;
};

/**
 * 读取并复制插件传入的正文输入；allowEmpty 为 false 时拒绝空 Markdown 与空节点数组，
 * share 为 true 时才接受 shareOf（新建宿主内容的入口）。
 */
export function readContentInput(
  value: unknown,
  options: { allowEmpty: boolean; share?: boolean }
): PluginContentInput {
  if (!isRecord(value)) throw new Error("正文输入无效");
  const keys = Object.keys(value).filter(key => value[key] !== undefined);
  const kinds = options.share ? "markdown、nodes、copyOf 或 shareOf" : "markdown、nodes 或 copyOf";
  if (keys.length !== 1) throw new Error(`正文输入必须且只能提供 ${kinds} 之一`);
  let input: PluginContentInput;
  if (keys[0] === "markdown") {
    const markdown = value.markdown;
    if (typeof markdown !== "string" || markdown.length > CONTENT_INPUT_LIMITS.markdown)
      throw new Error("markdown 无效");
    input = { markdown };
  } else if (keys[0] === "nodes") {
    const nodes = copyJson(value.nodes);
    if (JSON.stringify(nodes).length > CONTENT_INPUT_LIMITS.nodes) throw new Error("正文节点过大");
    assertContentNodes(nodes);
    input = { nodes };
  } else if (keys[0] === "copyOf") {
    input = { copyOf: readRef(value.copyOf, "copyOf") };
  } else if (keys[0] === "shareOf" && options.share) {
    input = { shareOf: readRef(value.shareOf, "shareOf") };
  } else if (keys[0] === "shareOf") {
    throw new Error("shareOf 只能用于新建卡片、文章、项目文档与插入到项目");
  } else throw new Error(`正文输入必须且只能提供 ${kinds} 之一`);
  if (!options.allowEmpty && isEmptyInput(input)) throw new Error("正文不能为空");
  return input;
}
