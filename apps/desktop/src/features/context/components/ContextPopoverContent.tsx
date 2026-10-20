/**
 * 脉络浮层内容，分区顺序（KL-023）：来源、连接（显式 content_links ∪ 内联引用，含添加/解除）、
 * 被引用（来源 + 原文片段，被引用的标题在句中点亮）、也出现在、衍生、被使用、相关问题，
 * 末尾「相关」（KL-057，语义相近但还没有关系，不计入关联数）。
 * 只负责展示与点击回调，数据与开合由 ContextBadge 管理；「连接」分区自带增删动作。
 */

import { CircleHelp, Link2 } from "lucide-react";
import { cn } from "@tau/ui";
import type { EntityRef } from "@/entity/ref";
import type { InlineRefSnippet } from "@/entity/inline-refs";
import type {
  ContextEntity,
  ContextLineageItem,
  ContextOpenTarget,
  ContextQuestion,
  ContextRelated,
  ContextUsage,
  EntityContext,
} from "@/types/entity-context";
import { STATUS_META } from "@/features/questions/model";
import { ENTITY_KIND_META, LINEAGE_KIND_META, USAGE_KIND_ICON } from "../model";
import { useEntityKindMeta } from "@/components/EntityKind";
import { ContextRow as Row, ContextSection as Section } from "./ContextList";
import { ContextLinksSection } from "./ContextLinks";

interface ContextPopoverContentProps {
  context: EntityContext | null;
  /** 自身实体地址与正文（连接分区的动作落点与排除项） */
  self: EntityRef;
  onOpenEntity: (ref: EntityRef) => void;
  onOpenQuestion: (questionId: number) => void;
  onOpenTarget: (target: ContextOpenTarget) => void;
  /** 「相关」分区；未取到时不显示 */
  related?: ContextRelated[];
  /** 给「相关」里的内容行添加连接；缺省不显示动作 */
  onConnect?: (ref: EntityRef) => void;
  /** 关闭浮层（连接分区导航时使用） */
  close: () => void;
  /** 连接选择器弹窗开合上报（宿主浮层据此锁定，防外点误关） */
  onDialogOpenChange?(open: boolean): void;
}

const STATUS_TONE: Record<ContextQuestion["status"], string> = {
  not_started: "text-ink-3",
  in_progress: "text-warn",
  resolved: "text-ok",
};

function SourceLine({ entity }: { entity: ContextEntity }) {
  const { icon: Icon, label } = useEntityKindMeta(entity.ref, ENTITY_KIND_META[entity.ref.kind]);
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

const EMPTY: Omit<EntityContext, "self" | "selfContentIds"> = {
  links: [],
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
  self,
  onOpenEntity,
  onOpenQuestion,
  onOpenTarget,
  related = [],
  onConnect,
  close,
  onDialogOpenChange,
}: ContextPopoverContentProps) {
  const {
    selfContentIds,
    links,
    backlinks,
    backlinkTotal,
    projections,
    questions,
    sources,
    derived,
    notebookProjections,
    usages,
  } = context ?? { ...EMPTY, selfContentIds: [] };
  const hidden = backlinkTotal - backlinks.length;
  const openEntityRow = (entity: ContextEntity) =>
    entity.open ? onOpenTarget(entity.open) : onOpenEntity(entity.ref);
  return (
    <div className="px-1.5 pb-2 pt-2.5">
      {sources.length > 0 && (
        <Section title="来源">
          <LineageRows items={sources} onOpenTarget={onOpenTarget} />
        </Section>
      )}
      <ContextLinksSection
        self={self}
        links={links}
        selfContentIds={selfContentIds}
        onOpenEntity={onOpenEntity}
        close={close}
        onDialogOpenChange={onDialogOpenChange}
      />
      {backlinks.length > 0 && (
        <Section title="被引用">
          {backlinks.map(({ source, snippets }) => (
            <Row key={`${source.ref.kind}:${source.ref.id}`} onClick={() => openEntityRow(source)}>
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
            <Row key={`${entity.ref.kind}:${entity.ref.id}`} onClick={() => openEntityRow(entity)}>
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
      {related.length > 0 && (
        <Section title="相关">
          {related.map(({ entity, summary }) => (
            <Row
              key={`${entity.ref.kind}:${entity.ref.id}`}
              onClick={() => openEntityRow(entity)}
              action={
                onConnect ? (
                  <button
                    type="button"
                    title="添加连接"
                    aria-label={`与「${entity.title}」添加连接`}
                    onClick={() => onConnect(entity.ref)}
                    className="text-ink-3 hover:bg-accent-soft hover:text-accent-text rounded-tau-sm grid size-[22px] place-items-center"
                  >
                    <Link2 className="size-[12px]" strokeWidth={1.75} />
                  </button>
                ) : undefined
              }
            >
              <SourceLine entity={entity} />
              {summary && (
                <span className="text-ink-2 mt-0.5 block truncate text-[12.5px]">{summary}</span>
              )}
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}
