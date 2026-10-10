/**
 * 从 Slate 正文提取内联引用（content-link 节点）。
 *
 * 实现位于 @tau/shared/inline-refs（桌面端与移动端共用），此处仅作转发。
 */

export { extractInlineRefs, inlineCardIds, slatePlainText } from "@tau/shared/inline-refs";
export type { InlineRef, InlineRefSnippet } from "@tau/shared/inline-refs";
