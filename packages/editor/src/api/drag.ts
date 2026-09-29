import type { Element } from "slate";

/**
 * 拖拽声明（01 §5.4）：知识归属容器——块自己声明可拖性与放置谓词，
 * 内核（BlockDragHost）统一渲染手柄 / 插入线 / 悬停标记，块组件只渲染内容。
 */

export interface ElementDragSpec {
  /** 自身可拖（显示手柄）；false 时本块仅作为放置目标参与 */
  self: boolean;
  /** 内部子内容是否参与块级拖拽；false 时更深的子块不显示手柄（如勾选项里的段落） */
  children: boolean;
  /**
   * 放置谓词：拖动元素能否落到本块（含本块内部）。缺省接受任何块。
   * 「拖到本块内部的子块前后」也经过本谓词——容器不必认识子块的类型细节。
   */
  accepts?: (dragElement: Element) => boolean;
  /**
   * 手柄位置微调（经 cn 合并，可覆盖默认 left / top / 尺寸；如标题让出折叠箭头的位置）。
   * 手柄挂在 chrome wrapper 上，em 按 wrapper（正文）字号计算；需随元素属性变化（如标题级别）时传函数。
   */
  handleClassName?: string | ((element: Element) => string | undefined);
}

/** `true` 是 `{ self: true, children: true }` 的简写；未声明的类型没有拖拽 chrome */
export type ElementDrag = boolean | ElementDragSpec;

export const normalizeDragSpec = (drag: ElementDrag | undefined): ElementDragSpec | undefined =>
  drag === undefined
    ? undefined
    : drag === true
      ? { self: true, children: true }
      : drag === false
        ? { self: false, children: false }
        : drag;
