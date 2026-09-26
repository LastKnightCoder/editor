/** 文章风格（生成弹窗与对话里的生成工具共用；用户按名称选，不接触 id） */

import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";

export const ARTICLE_STYLES: {
  value: VideoEbookRewriteStyle;
  label: string;
  description: string;
}[] = [
  { value: "magazine", label: "杂志长文", description: "更有阅读感，兼顾叙事性与信息密度" },
  { value: "academic", label: "学术总结", description: "更严谨克制，强调定义、论证与结论" },
  { value: "casual", label: "轻松博客", description: "更自然亲切，适合顺畅阅读和理解" },
  { value: "technical", label: "技术文档", description: "更强调术语统一、结构清晰和可检索性" },
];
