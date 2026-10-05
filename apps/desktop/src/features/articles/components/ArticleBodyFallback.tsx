/**
 * 文章正文会话就绪前的只读占位：只渲染开头若干块（足够填满首屏），代替加载转圈。
 * 详情页的纸是形变目标（D-106），转场截图时正文不应是转圈；长文不整篇双渲染。
 */

import { useMemo } from "react";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor";
import { getContentKit } from "@/services/editorKit";
import ErrorBoundary from "@/components/ErrorBoundary";

const FIRST_SCREEN_BLOCKS = 24;

export function ArticleBodyFallback({ content }: { content: Descendant[] }) {
  const head = useMemo(() => content.slice(0, FIRST_SCREEN_BLOCKS), [content]);
  return (
    <ErrorBoundary>
      <Editor kit={getContentKit()} readonly initValue={head.length ? head : undefined} />
    </ErrorBoundary>
  );
}
