/**
 * 脉络浮层内容，分区顺序（KL-023）：来源、调用方的前置分区（如卡片的「连接」）、引用了、
 * 被引用（来源 + 原文片段，被引用的标题在句中点亮）、也出现在、衍生、被使用、相关问题。
 * 只负责展示与点击回调，数据与开合由 ContextBadge 管理。
 */

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@tau/ui";
import type { EntityRef } from "@/entity/ref";
import type { InlineRefSnippet } from "@/entity/inline-refs";
import type {
  ContextEntity,
  ContextLineageItem,
  ContextOpenTarget,
  ContextQuestion,
  ContextUsage,
  EntityContext,
} from "@/types/entity-context";
import { STATUS_META } from "@/features/questions/model";
import { ENTITY_KIND_META, LINEAGE_KIND_META, USAGE_KIND_ICON } from "../model";
import { ContextRow as Row, ContextSection as Section } from "./ContextList";

interface ContextPopoverContentProps {
  context: EntityContext | null;
  /** 排在最前的分区，由调用方提供 */
  leading?: ReactNode;
  /** 不显示「引用了」（卡片的「连接」分区已包含出链） */
  hideOutlinks?: boolean;
  onOpenEntity: (ref: EntityRef) => void;
  onOpenQuestion: (questionId: number) => void;
  onOpenTarget: (target: ContextOpenTarget) => void;
}

const STATUS_TONE: Record<ContextQuestion["status"], string> = {
  not_started: "text-ink-3",
  in_progress: "text-warn",
  resolved: "text-ok",
};

function SourceLine({ entity }: { entity: ContextEntity }) {
  const { icon: Icon, label } = ENTITY_KIND_META[entity.ref.kind];
  return (
    <span className="text-ink-3 flex min-w-0 items-center gap-1.5 text-[12px]">
      <Icon className="size-[13px] shrink-0" strokeWidth={1.75} />
      <b className="text-ink-2 min-w-0 truncate font-medium">{entity.title}</b>
      <span className="shrink-0">{entity.meta || label}</span>
    </span>
  );
}

function LineageLine({ item }: { item: ContextLineageItem }) {
  const { icon: Icon, label } = LINEAGE_KIND_META[item.node.kind];
  return (
    <span className="text-ink-3 flex min-w-0 items-center gap-1.5 text-[12px]">
      <Icon className="size-[13px] shrink-0" strokeWidth={1.75} />
      {item.missing ? (
        <span className="min-w-0 truncate">{label}已删除</span>
      ) : (
        <>
          <b className="text-ink-2 min-w-0 truncate font-medium">{item.title}</b>
          <span className="shrink-0">{item.meta}</span>
        </>
      )}
    </span>
  );
}

function LineageRows({
  items,
  onOpenTarget,
}: {
  items: ContextLineageItem[];
  onOpenTarget: (target: ContextOpenTarget) => void;
}) {
  return items.map(item => {
    const key = `${item.node.kind}:${item.node.id}`;
    const { open } = item;
    // 已删除的来源保留一行、不可点（KL-026）
    return open ? (
      <Row key={key} onClick={() => onOpenTarget(open)}>
        <LineageLine item={item} />
      </Row>
    ) : (
      <div key={key} className="px-2.5 py-[7px]">
        <LineageLine item={item} />
      </div>
    );
  });
}

function UsageLine({ usage }: { usage: ContextUsage }) {
  const Icon = USAGE_KIND_ICON[usage.kind];
  const meta =
    usage.kind === "whiteboard"
      ? usage.meta
      : usage.kind === "todo"
        ? usage.completed
          ? "待办 · 已完成"
          : "待办"
        : "Notebook";
  return (
    <span className="text-ink-3 flex min-w-0 items-center gap-1.5 text-[12px]">
      <Icon className="size-[13px] shrink-0" strokeWidth={1.75} />
      <b
        className={cn(
          "text-ink-2 min-w-0 truncate font-medium",
          usage.kind === "todo" && usage.completed && "line-through"
        )}
      >
        {usage.title}
      </b>
      <span className="shrink-0">{meta}</span>
    </span>
  );
}

function Snippet({ snippet }: { snippet: InlineRefSnippet }) {
  return (
    <span className="text-ink-2 mt-0.5 block text-[13px] leading-[1.75]">
      {snippet.before}
      <mark className="text-ink-1 rounded-[2px] bg-transparent px-px font-medium shadow-[inset_0_-0.42em_0_var(--tau-accent-soft)]">
        {snippet.label}
      </mark>
      {snippet.after}
    </span>
  );
}

const EMPTY: Omit<EntityContext, "self"> = {
  outlinks: [],
  backlinks: [],
  backlinkTotal: 0,
  projections: [],
  questions: [],
  sources: [],
  derived: [],
  notebookProjections: [],
  usages: [],
};

export function ContextPopoverContent({
  context,
  leading,
  hideOutlinks = false,
  onOpenEntity,
  onOpenQuestion,
  onOpenTarget,
}: ContextPopoverContentProps) {
  const {
    outlinks,
    backlinks,
    backlinkTotal,
    projections,
    questions,
    sources,
    derived,
    notebookProjections,
    usages,
  } = context ?? EMPTY;
  const hidden = backlinkTotal - backlinks.length;
  return (
    <div className="px-1.5 pb-2 pt-2.5">
      {sources.length > 0 && (
        <Section title="来源">
          <LineageRows items={sources} onOpenTarget={onOpenTarget} />
        </Section>
      )}
      {leading}
      {!hideOutlinks && outlinks.length > 0 && (
        <Section title="引用了">
          {outlinks.map(entity => (
            <Row
              key={`${entity.ref.kind}:${entity.ref.id}`}
              onClick={() => onOpenEntity(entity.ref)}
            >
              <SourceLine entity={entity} />
            </Row>
          ))}
        </Section>
      )}
      {backlinks.length > 0 && (
        <Section title="被引用">
          {backlinks.map(({ source, snippets }) => (
            <Row
              key={`${source.ref.kind}:${source.ref.id}`}
              onClick={() => onOpenEntity(source.ref)}
            >
              <SourceLine entity={source} />
              {snippets.map((snippet, index) => (
                <Snippet key={index} snippet={snippet} />
              ))}
            </Row>
          ))}
          {hidden > 0 && (
            <p className="text-ink-3 mx-2.5 mt-1 text-[12px]">还有 {hidden} 处未列出</p>
          )}
        </Section>
      )}
      {projections.length + notebookProjections.length > 0 && (
        <Section title="也出现在">
          {projections.map(entity => (
            <Row
              key={`${entity.ref.kind}:${entity.ref.id}`}
              onClick={() => onOpenEntity(entity.ref)}
            >
              <SourceLine entity={entity} />
            </Row>
          ))}
          <LineageRows items={notebookProjections} onOpenTarget={onOpenTarget} />
        </Section>
      )}
      {derived.length > 0 && (
        <Section title="衍生">
          <LineageRows items={derived} onOpenTarget={onOpenTarget} />
        </Section>
      )}
      {usages.length > 0 && (
        <Section title="被使用">
          {usages.map(usage => (
            <Row key={usage.key} onClick={() => onOpenTarget(usage.open)}>
              <UsageLine usage={usage} />
            </Row>
          ))}
        </Section>
      )}
      {questions.length > 0 && (
        <Section title="相关问题">
          {questions.map(question => (
            <Row key={question.id} onClick={() => onOpenQuestion(question.id)}>
              <span className="flex items-center gap-1.5 text-[13px]">
                <CircleHelp className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
                <span className="text-ink-1 min-w-0 flex-1 truncate">{question.title}</span>
                <span className={cn("shrink-0 text-[11.5px]", STATUS_TONE[question.status])}>
                  {STATUS_META[question.status].label}
                </span>
              </span>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}
