/**
 * 文章详情的创作模式：左白板栏（flex-1）、中间 12px 缝（ResizeHandle 平时不可见）、右正文栏默认 640px。
 * 结构摘自 features/compose/components/ComposeLayout.tsx 与 articles/views/ArticleDetailView.tsx。
 * split 0→1 是从普通文章页展开成双栏的过程，0 即普通文章页。
 */
import type { ReactNode } from "react";
import { mix } from "../../brand/motion";
import { ArticleHero } from "../parts/ArticleHero";

export const EDITOR_PANE_DEFAULT = 640;
/** ResizeHandle 宽 8 + 两侧 mx-0.5 */
const HANDLE = 12;

export function ComposePage({
  innerWidth,
  split,
  board,
  title,
  words,
  links,
  togglePressed,
  children,
}: {
  /** 页面内容区宽度（主区减去 px-4），用于展开过程的插值 */
  innerWidth: number;
  split: number;
  board: ReactNode;
  title: string;
  words: number;
  links?: number;
  togglePressed?: number;
  /** 正文 */
  children: ReactNode;
}) {
  const composing = split > 0;
  return (
    <div className="mx-auto flex h-full min-h-0 w-full flex-col px-4 pt-1 pb-4">
      <div className="flex min-h-0 w-full flex-1">
        {composing && (
          <>
            <div className="bg-surface shadow-card rounded-tau-lg relative min-h-0 min-w-0 flex-1 overflow-hidden" style={{ opacity: Math.min(1, split * 2) }}>
              {board}
            </div>
            <div className="shrink-0 self-stretch" style={{ width: HANDLE * split }} />
          </>
        )}
        <div className="flex min-h-0 min-w-0 shrink-0 flex-col" style={{ width: mix(innerWidth, EDITOR_PANE_DEFAULT, split) }}>
          <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              <ArticleHero title={title} titleCount={[...title].length} words={words} links={links} composing={composing} togglePressed={togglePressed} />
              <div className="grid grid-cols-[1fr_minmax(0,720px)_1fr] items-start px-[26px] pt-8 pb-10">
                <article className="col-start-2 min-w-0 text-[16px] leading-[1.65]">{children}</article>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
