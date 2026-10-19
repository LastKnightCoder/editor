/**
 * 文章详情 + 就地成型演示。结构摘自 features/articles/views/ArticleDetailView.tsx（无题图，正文版心 720px）。
 */
import type { ReactNode } from "react";
import { LiveDoc } from "../doc/LiveDoc";
import { ArticleHero } from "../parts/ArticleHero";
import type { Timed } from "../doc/script";

export function ArticleEditorPage({
  title,
  titleCount,
  timed,
  frame,
  dark,
  scroll = 0,
  words,
  links = 2,
  tail,
}: {
  title: string;
  /** 标题已打出的字数 */
  titleCount: number;
  timed: Timed[];
  frame: number;
  dark?: boolean;
  /** 正文向上滚动的像素 */
  scroll?: number;
  words: number;
  links?: number;
  /** 正文末尾追加的内容（如正在敲的斜杠命令） */
  tail?: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <div style={{ transform: `translateY(${-scroll}px)` }}>
            <ArticleHero title={title} titleCount={titleCount} words={words} links={links} />
            <div className="grid grid-cols-[1fr_minmax(0,720px)_1fr] items-start px-[26px] pt-8 pb-10">
              <article className="col-start-2 min-w-0">
                <LiveDoc timed={timed} frame={frame} dark={dark} />
                {tail}
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
