import type { Metadata } from "@/types/weread";
import type { CustomText } from "@/components/Editor/types";

// 微信读书高亮样式：0=下划线，1=背景高亮（马克笔），2=波浪线
export type WeReadHighlightStyle = 0 | 1 | 2;

// 微信读书颜色样式：1=红色，2=紫色，3=蓝色，4=绿色，5=黄色
export type WeReadColorStyle = 1 | 2 | 3 | 4 | 5;

/**
 * 书籍元信息扩展元素
 */
export interface WeReadMetadataElement {
  type: "weread-metadata";
  metaData: Metadata;
  children: CustomText[];
}

/**
 * 章节扩展元素
 */
export interface WeReadChapterElement {
  type: "weread-chapter";
  chapterTitle: string;
  chapterUid: number;
  chapterIdx: number;
  level: number;
  children: WeReadBookmarkElement[];
}

/**
 * 书签扩展元素（合并了高亮和评论）
 */
export interface WeReadBookmarkElement {
  type: "weread-bookmark";
  bookmarkId: string; // 高亮ID
  reviewId?: string; // 评论ID（可选）
  bookId: string;
  chapterUid: number;
  range: string; // 位置范围 "start-end"
  markText: string; // 高亮的原文
  reviewContent?: string; // 个人评论的 Markdown 字符串（可选）
  reviewDescendants?: any[]; // 个人评论反序列化后的 Slate 结构（用于编辑器）
  style: WeReadHighlightStyle; // 高亮样式
  colorStyle: WeReadColorStyle; // 颜色样式
  bookVersion?: number; // 书籍版本号
  children: CustomText[];
}

// 导出所有微信读书扩展元素类型的联合类型
export type WeReadElement =
  | WeReadMetadataElement
  | WeReadChapterElement
  | WeReadBookmarkElement;
