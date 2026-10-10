// 脉络浮层（SnapSheet）：分区顺序对齐桌面 ContextPopoverContent——来源、连接、被引用、
// 也出现在（投影 + Notebook 笔记）、衍生、被使用、相关问题；移动端无「相关」与白板分区。
// 条目点击先关浮层再跳转（返回时浮层不残留）；无承载页面的类型只读展示。

import { useState } from "react";
import { ChevronRight, Waypoints } from "lucide-react";
import { SnapSheet, type SnapSheetState } from "../../components/SnapSheet";
import { useNavigator } from "../../router";
import { ENTITY_KIND_META, LINEAGE_KIND_META, USAGE_KIND_META, contextCount } from "./model";
import { openContextEntity, openContextNode } from "./open";
import type {
  ContextBacklink,
  ContextEntity,
  ContextLineageItem,
  ContextLink,
  ContextQuestion,
  ContextUsage,
  EntityContext,
} from "./types";

type ContextSheetProps = {
  open: boolean;
  context: EntityContext;
  onClose: () => void;
};

function kindMetaOf(kind: string) {
  return LINEAGE_KIND_META[kind] ?? { label: kind, icon: Waypoints };
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="border-line flex items-center border-b py-3">
      <span className="text-ink-3 text-[11px] font-bold tracking-[0.14em]">
        {label} · {count}
      </span>
    </div>
  );
}

function ContextEntityRow({ entity }: { entity: ContextEntity }) {
  const navigator = useNavigator();
  const meta = ENTITY_KIND_META[entity.kind] ?? {
    label: entity.kind,
    icon: Waypoints,
  };
  const Icon = meta.icon;
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-3 text-left"
      onClick={() => openContextEntity(navigator, entity)}
    >
      <Icon size={15} className="text-ink-3 shrink-0" aria-hidden />
      <span className="text-meta-ink w-[52px] shrink-0 text-[11.5px]">{meta.label}</span>
      <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-medium">
        {entity.title}
      </span>
      <ChevronRight size={14} className="text-ink-3 shrink-0" />
    </button>
  );
}

function ContextLinkRow({ link }: { link: ContextLink }) {
  return (
    <div className="flex w-full items-center gap-3 py-3">
      <ContextLinkTarget link={link} />
    </div>
  );
}

function ContextLinkTarget({ link }: { link: ContextLink }) {
  const navigator = useNavigator();
  const meta = ENTITY_KIND_META[link.entity.kind] ?? {
    label: link.entity.kind,
    icon: Waypoints,
  };
  const Icon = meta.icon;
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 text-left"
      onClick={() => openContextEntity(navigator, link.entity)}
    >
      <Icon size={15} className="text-ink-3 shrink-0" aria-hidden />
      <span className="text-meta-ink w-[52px] shrink-0 text-[11.5px]">{meta.label}</span>
      <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-medium">
        {link.entity.title}
      </span>
      {link.inlineOnly ? <span className="text-ink-3 shrink-0 text-[11px]">内联</span> : null}
      <ChevronRight size={14} className="text-ink-3 shrink-0" />
    </button>
  );
}

function ContextBacklinkRow({ backlink }: { backlink: ContextBacklink }) {
  const navigator = useNavigator();
  const meta = ENTITY_KIND_META[backlink.source.kind] ?? {
    label: backlink.source.kind,
    icon: Waypoints,
  };
  const Icon = meta.icon;
  return (
    <div className="py-3">
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        onClick={() => openContextEntity(navigator, backlink.source)}
      >
        <Icon size={15} className="text-ink-3 shrink-0" aria-hidden />
        <span className="text-meta-ink w-[52px] shrink-0 text-[11.5px]">{meta.label}</span>
        <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-medium">
          {backlink.source.title}
        </span>
        <ChevronRight size={14} className="text-ink-3 shrink-0" />
      </button>
      {backlink.snippets.map((snippet, index) => (
        <p key={index} className="text-ink-3 mt-1.5 line-clamp-2 text-[12px] leading-[1.6]">
          {snippet.before}
          <span className="text-ink font-semibold">{snippet.label}</span>
          {snippet.after}
        </p>
      ))}
    </div>
  );
}

function ContextNodeRow({ item }: { item: ContextLineageItem | ContextUsage }) {
  const navigator = useNavigator();
  const usage = "nodeId" in item ? null : item;
  const meta = usage ? USAGE_KIND_META[usage.kind] : kindMetaOf(item.kind);
  const Icon = meta.icon;
  const missing = "nodeId" in item ? item.missing : false;
  const title = item.title || (missing ? "已删除" : "未命名条目");
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-3 text-left"
      onClick={() => openContextNode(navigator, item)}
    >
      <Icon size={15} className="text-ink-3 shrink-0" aria-hidden />
      <span className="text-meta-ink w-[52px] shrink-0 text-[11.5px]">{meta.label}</span>
      <span
        className={`min-w-0 flex-1 truncate text-[13.5px] font-medium ${
          missing ? "text-ink-3" : "text-ink"
        }`}
      >
        {usage?.completed ? <span className="text-ink-3 mr-1.5 line-through">{title}</span> : title}
      </span>
      <ChevronRight size={14} className="text-ink-3 shrink-0" />
    </button>
  );
}

function ContextQuestionRow({ question }: { question: ContextQuestion }) {
  return (
    <div className="flex w-full items-center gap-3 py-3">
      <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-medium">
        {question.title || "未命名问题"}
      </span>
      {question.status === "resolved" ? (
        <span className="text-ok shrink-0 text-[11px]">已解决</span>
      ) : null}
    </div>
  );
}

export function ContextSheet({ open, context, onClose }: ContextSheetProps) {
  const [state, setState] = useState<SnapSheetState>("normal");
  const count = contextCount(context);
  const projections = [...context.projections, ...context.notebookProjections];

  return (
    <SnapSheet
      open={open}
      state={state}
      states={["normal", "full"]}
      normalHeight={0.72}
      onClose={onClose}
      onStateChange={next => setState(next)}
    >
      <>
        <SnapSheet.Handle />
        <header className="px-4 pb-2">
          <div className="flex items-center gap-2">
            <Waypoints size={15} className="text-ink-3" aria-hidden />
            <span className="text-ink text-[15px] font-extrabold">脉络 · {count}</span>
          </div>
          <p className="text-ink-2 mt-1 line-clamp-1 text-[12.5px]">
            {context.selfEntity.title}
            {context.selfEntity.meta ? ` · ${context.selfEntity.meta}` : ""}
          </p>
          {context.aiMeta?.summary ? (
            <p className="bg-input text-ink-2 mt-2.5 line-clamp-3 rounded-xl px-3 py-2.5 text-[12.5px] leading-[1.6]">
              {context.aiMeta.summary}
            </p>
          ) : null}
        </header>
        <SnapSheet.Scroll className="px-4 pb-8 pt-2">
          {count === 0 ? (
            <div className="py-12 text-center">
              <p className="text-ink-3 text-sm">暂无关联</p>
            </div>
          ) : (
            <>
              {context.sources.length > 0 ? (
                <section>
                  <SectionHeader label="来源" count={context.sources.length} />
                  {context.sources.map(item => (
                    <ContextNodeRow key={`source:${item.kind}:${item.nodeId}`} item={item} />
                  ))}
                </section>
              ) : null}
              {context.links.length > 0 ? (
                <section>
                  <SectionHeader label="连接" count={context.links.length} />
                  {context.links.map(link => (
                    <ContextLinkRow
                      key={`link:${link.entity.kind}:${link.entity.id}`}
                      link={link}
                    />
                  ))}
                </section>
              ) : null}
              {context.backlinks.length > 0 ? (
                <section>
                  <SectionHeader label="被引用" count={context.backlinkTotal} />
                  {context.backlinks.map(backlink => (
                    <ContextBacklinkRow
                      key={`backlink:${backlink.source.kind}:${backlink.source.id}`}
                      backlink={backlink}
                    />
                  ))}
                </section>
              ) : null}
              {projections.length > 0 ? (
                <section>
                  <SectionHeader label="也出现在" count={projections.length} />
                  {context.projections.map(entity => (
                    <ContextEntityRow
                      key={`projection:${entity.kind}:${entity.id}`}
                      entity={entity}
                    />
                  ))}
                  {context.notebookProjections.map(item => (
                    <ContextNodeRow key={`notebook:${item.nodeId}`} item={item} />
                  ))}
                </section>
              ) : null}
              {context.derived.length > 0 ? (
                <section>
                  <SectionHeader label="衍生" count={context.derived.length} />
                  {context.derived.map(item => (
                    <ContextNodeRow key={`derived:${item.kind}:${item.nodeId}`} item={item} />
                  ))}
                </section>
              ) : null}
              {context.usages.length > 0 ? (
                <section>
                  <SectionHeader label="被使用" count={context.usages.length} />
                  {context.usages.map(usage => (
                    <ContextNodeRow key={usage.key} item={usage} />
                  ))}
                </section>
              ) : null}
              {context.questions.length > 0 ? (
                <section>
                  <SectionHeader label="相关问题" count={context.questions.length} />
                  {context.questions.map(question => (
                    <ContextQuestionRow key={`question:${question.id}`} question={question} />
                  ))}
                </section>
              ) : null}
            </>
          )}
        </SnapSheet.Scroll>
      </>
    </SnapSheet>
  );
}

export default ContextSheet;
