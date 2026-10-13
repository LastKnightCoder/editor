/**
 * 漫步主体卡：当前站的内容——元信息、「为什么是它」、标题、正文（PDF 批注为摘录 + 笔记）、
 * 标签行与动作条（打开原文 / 做成闪卡 / 别再抽到这条）。内容切换走 walk-in 入场动效。
 */

import { BookOpen, EyeOff, Layers } from "lucide-react";
import dayjs from "dayjs";
import type { Descendant } from "slate";
import { Button, FadeScroll, IconButton, Panel } from "@tau/ui";
import { CardContentPreview } from "@/features/cards/components/CardContentPreview";
import { WALK_KIND_META, formatWalkWhy } from "../model";
import type { WalkStep } from "../trail";

export function WalkCard({
  step,
  stepKey,
  onOpenSource,
  onMute,
  onMakeFlashcard,
}: {
  step: WalkStep;
  /** 内容切换动效的 key（kind:id:index） */
  stepKey: string;
  onOpenSource(): void;
  onMute(): void;
  onMakeFlashcard(): void;
}) {
  const { item } = step;
  const kind = WALK_KIND_META[item.ref.kind];
  const KindIcon = kind.icon;
  const why = formatWalkWhy(step);
  const WhyIcon = why.icon;
  const isPdfAnnotation = item.ref.kind === "pdf-annotation";

  return (
    <Panel
      variant="outline"
      pad="none"
      className="rounded-tau-lg flex min-h-0 flex-col overflow-hidden"
    >
      <div
        key={stepKey}
        className="motion-safe:animate-walk-in flex min-h-0 flex-1 flex-col px-8 pb-4 pt-6"
      >
        <div className="text-tau-micro text-ink-3 flex flex-wrap items-center gap-2">
          <span className="bg-accent-soft text-accent-text inline-flex h-[22px] items-center gap-1 rounded-full px-2">
            <KindIcon className="size-3.5 shrink-0" strokeWidth={1.75} />
            {kind.label}
          </span>
          <span className="tabular-nums">写于 {dayjs(item.createTime).format("YYYY-MM-DD")}</span>
          {item.source && <span>· {item.source}</span>}
        </div>
        <p className="text-tau-meta text-ink-2 mt-2.5 flex items-center gap-1.5">
          <WhyIcon className="text-accent size-3.5 shrink-0" strokeWidth={1.75} />
          {why.text}
        </p>
        <h2 className="text-tau-title text-ink-1 mb-3 mt-3 line-clamp-2 font-semibold leading-snug">
          {item.title}
        </h2>
        {/* 宽屏：正文区内滚，滚动区右扩到卡片边缘，4px 滚动条居中于正文与卡边之间（14 + 4 + 14 = px-8）；
            窄屏（上下布局）：正文全量展开，由页面主体统一滚动，避免卡片被压扁成一条缝 */}
        <FadeScroll className="@max-[900px]:flex-none @max-[900px]:overflow-y-visible -mr-8 min-h-0 flex-1 border-r-[14px] pr-[14px]">
          {isPdfAnnotation ? (
            <>
              {item.excerpt && (
                <blockquote className="border-accent text-tau-body-lg text-ink-1 border-l-2 pl-4 leading-[1.85]">
                  {item.excerpt}
                </blockquote>
              )}
              {item.note && (
                <div className="mt-4">
                  <p className="text-tau-micro text-ink-3 mb-1">我的批注</p>
                  <p className="text-tau-body text-ink-2">{item.note}</p>
                </div>
              )}
            </>
          ) : (
            item.content && (
              <CardContentPreview content={item.content as Descendant[]} blocks={Infinity} />
            )
          )}
        </FadeScroll>
        {item.tags.length > 0 && (
          <div className="text-tau-micro text-ink-3 mt-3 flex flex-wrap gap-2.5">
            {item.tags.map(tag => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}
        <div className="border-line-1 mt-4 flex items-center gap-1.5 border-t pt-3">
          <Button variant="secondary" size="sm" icon={BookOpen} onClick={onOpenSource}>
            打开原文
          </Button>
          {!isPdfAnnotation && (
            <Button variant="ghost" size="sm" icon={Layers} onClick={onMakeFlashcard}>
              做成闪卡
            </Button>
          )}
          <span className="flex-1" />
          <IconButton aria-label="别再抽到这条" title="别再抽到这条" onClick={onMute}>
            <EyeOff className="size-4" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>
    </Panel>
  );
}
