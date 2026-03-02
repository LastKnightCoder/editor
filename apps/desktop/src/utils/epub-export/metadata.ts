import type { Descendant } from "slate";
import type { EpubMetadataInput } from "@/types";
import { getEditorText } from "@/utils/editor";

export interface EpubRememberedMetadata {
  author?: string;
  language?: string;
}

interface SlateNodeLike {
  type?: string;
  level?: number;
  text?: string;
  url?: string;
  children?: SlateNodeLike[];
}

const DEFAULT_AUTHOR = "Tau 用户";
const DEFAULT_LANGUAGE = "zh-CN";

const normalizeText = (value?: string): string => {
  return (value || "").trim();
};

const nodeToText = (node: SlateNodeLike): string => {
  if (node.type === "formatted") {
    return normalizeText(node.text);
  }
  if (!Array.isArray(node.children) || node.children.length === 0) {
    return "";
  }
  return node.children.map(nodeToText).join("").trim();
};

const traverse = (
  nodes: SlateNodeLike[],
  visitor: (node: SlateNodeLike) => void,
) => {
  for (const node of nodes) {
    visitor(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      traverse(node.children, visitor);
    }
  }
};

export const extractFirstHeadingText = (
  content: Descendant[],
  level: number,
): string => {
  let headingText = "";
  traverse(content as SlateNodeLike[], (node) => {
    if (headingText) {
      return;
    }
    if (node.type === "header" && node.level === level) {
      headingText = nodeToText(node);
    }
  });
  return headingText;
};

export const extractFirstImageSrc = (content: Descendant[]): string => {
  let imageSrc = "";
  traverse(content as SlateNodeLike[], (node) => {
    if (imageSrc) {
      return;
    }
    if (
      (node.type === "image" || node.type === "inline-image") &&
      typeof node.url === "string" &&
      node.url.trim()
    ) {
      imageSrc = node.url.trim();
    }
  });
  return imageSrc;
};

export const extractImageSources = (
  content: Descendant[],
  limit = 12,
): string[] => {
  const imageSources: string[] = [];
  const sourceSet = new Set<string>();

  traverse(content as SlateNodeLike[], (node) => {
    if (imageSources.length >= limit) {
      return;
    }
    if (
      (node.type === "image" || node.type === "inline-image") &&
      typeof node.url === "string"
    ) {
      const url = node.url.trim();
      if (url && !sourceSet.has(url)) {
        sourceSet.add(url);
        imageSources.push(url);
      }
    }
  });

  return imageSources;
};

export const buildDefaultEpubMetadata = (params: {
  content: Descendant[];
  title?: string;
  remembered?: EpubRememberedMetadata;
}): EpubMetadataInput => {
  const { content, title, remembered } = params;
  const firstH1 = extractFirstHeadingText(content, 1);
  const fallbackTitle =
    normalizeText(getEditorText(content, 20)) || "未命名文档";
  const resolvedTitle = normalizeText(title) || firstH1 || fallbackTitle;
  const firstImageSrc = extractFirstImageSrc(content);

  return {
    title: resolvedTitle,
    author: normalizeText(remembered?.author) || DEFAULT_AUTHOR,
    language: normalizeText(remembered?.language) || DEFAULT_LANGUAGE,
    description: "",
    coverImageSrc: firstImageSrc || undefined,
  };
};
