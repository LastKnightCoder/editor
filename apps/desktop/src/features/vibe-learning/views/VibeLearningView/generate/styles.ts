import { notebookTranslator } from "../../../i18n";
/** 文章风格（生成弹窗与对话里的生成工具共用；用户按名称选，不接触 id） */

import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";

export const ARTICLE_STYLES: {
  value: VideoEbookRewriteStyle;
  toolLabel: string;
  label: string;
  toolDescription: string;
  description: string;
}[] = [
  {
    value: "magazine",
    toolLabel: "杂志长文",
    toolDescription: "更有阅读感，兼顾叙事性与信息密度",
    get label() {
      return notebookTranslator.t("style.magazine.label");
    },
    get description() {
      return notebookTranslator.t("style.magazine.description");
    },
  },
  {
    value: "academic",
    toolLabel: "学术总结",
    toolDescription: "更严谨克制，强调定义、论证与结论",
    get label() {
      return notebookTranslator.t("style.academic.label");
    },
    get description() {
      return notebookTranslator.t("style.academic.description");
    },
  },
  {
    value: "casual",
    toolLabel: "轻松博客",
    toolDescription: "更自然亲切，适合顺畅阅读和理解",
    get label() {
      return notebookTranslator.t("style.casual.label");
    },
    get description() {
      return notebookTranslator.t("style.casual.description");
    },
  },
  {
    value: "technical",
    toolLabel: "技术文档",
    toolDescription: "更强调术语统一、结构清晰和可检索性",
    get label() {
      return notebookTranslator.t("style.technical.label");
    },
    get description() {
      return notebookTranslator.t("style.technical.description");
    },
  },
];
