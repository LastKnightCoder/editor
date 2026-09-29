import type { Descendant } from "slate";

import type { MarkdownSerializer } from "./markdownSerializerRegistry.ts";

/** 业务 directive 解析器：键为 directive 名，返回 null 视为丢弃该节点 */
export type CustomDirectiveHandler = (
  attributes: Record<string, string | undefined>
) => Descendant | null;

/**
 * 一个元素类型的 Markdown 编解码（01 §8.2）。框架不自带任何元素类型：
 * 各扩展在自己的 markdown.ts（纯函数文件）里声明 codec，宿主把 codec 列表
 * 合成一次交给 createMarkdownProcessor，kit 与 Electron 主进程共用。
 */
export interface MarkdownCodec {
  /** 元素 type */
  type: string;
  /** 导入：按 directive 名解析（container / leaf / text 三种都查），优先于内置分支 */
  directives?: Record<string, CustomDirectiveHandler>;
  /** 导出 */
  serializer?: Omit<MarkdownSerializer, "type">;
  /** void 元素：位置映射只记元素级范围（导入、导出两个方向都生效） */
  isVoid?: boolean;
  /**
   * 行内包裹：导入时该 text directive 的子文本按 directive 整体范围记前后缀（位置映射用），
   * 值为 directive 名
   */
  inlineWrapperDirective?: string;
}
