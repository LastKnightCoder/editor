/**
 * 求索录详情的研究部分：研究概览、「径」（探索过程）与「据」（参考资料）。
 */
import { memo, type ReactNode } from "react";
import {
  CitationScope,
  CiteMark,
  MaterialKindLabel,
  MaterialLink,
  jumpToCitation,
  refAnchorId,
  useCitedScopes,
  type CitationScopeName,
} from "@blog/components/Citation";
import type { QuestData, QuestMaterialData, QuestTrailEntry } from "@blog/types";

const DAY_MS = 86_400_000;

const GROUP_LABELS: Record<QuestMaterialData["group"], string> = {
  external: "外部资料",
  note: "我的笔记",
  discussion: "讨论",
};

const SCOPE_LABELS: Record<CitationScopeName, string> = {
  answer: "解",
  trail: "径",
};

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const formatMonthDay = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

function getResearchStats(quest: QuestData) {
  const materials = quest.materials ?? [];
  const trail = quest.trail ?? [];
  const end =
    quest.status === "resolved" ? (quest.resolvedTime ?? quest.updateTime) : quest.updateTime;
  return {
    days: Math.max(1, Math.round((startOfDay(end) - startOfDay(quest.createTime)) / DAY_MS) + 1),
    references: materials.filter(material => material.kind !== "chat-session").length,
    notes: trail.filter(entry => entry.tone === "note").length,
    chats: materials.filter(material => material.kind === "chat-session").length,
  };
}

export const ResearchStats = memo(({ quest }: { quest: QuestData }) => {
  const stats = getResearchStats(quest);
  const items: Array<[string, number, string]> = [
    ["探索", stats.days, "天"],
    ["参考", stats.references, "份资料"],
    ["写下", stats.notes, "条笔记"],
    ["与 AI 讨论", stats.chats, "次"],
  ];
  const visible = items.filter(([, value], i) => i === 0 || value > 0);
  if (visible.length <= 1) return null;

  return (
    <div
      className="mt-6 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-[var(--color-text-tertiary)]"
      data-testid="quest-stats"
    >
      {visible.map(([label, value, unit]) => (
        <span key={label}>
          {label}{" "}
          <b className="mr-0.5 font-mono font-semibold text-[var(--color-text-primary)]">{value}</b>{" "}
          {unit}
        </span>
      ))}
    </div>
  );
});

ResearchStats.displayName = "ResearchStats";

const TRAIL_DOT_CLASS: Record<QuestTrailEntry["tone"], string> = {
  start: "border-[var(--color-text-primary)] bg-[var(--color-text-primary)]",
  milestone: "border-[var(--color-text-primary)] bg-[var(--color-text-primary)]",
  plain: "border-[var(--color-text-quaternary)] bg-[var(--color-bg-page)]",
  note: "border-[var(--color-accent)] bg-[var(--color-bg-page)]",
  done: "border-[var(--tau-ok)] bg-[var(--tau-ok)]",
};

const TrailRow = memo(({ entry }: { entry: QuestTrailEntry }) => {
  const isNote = entry.tone === "note";
  const strong = entry.tone !== "plain" && !isNote;

  return (
    <li className="relative grid grid-cols-[64px_1fr] gap-6 py-1.5">
      <span className="pt-[3px] text-right font-mono text-xs text-[var(--color-text-tertiary)]">
        {formatMonthDay(entry.time)}
      </span>
      <span
        className={`absolute left-[73px] top-[15px] h-[7px] w-[7px] rounded-full border ${TRAIL_DOT_CLASS[entry.tone]}`}
      />
      <div className="min-w-0 text-sm text-[var(--color-text-secondary)]">
        {isNote ? (
          <div className="whitespace-pre-wrap rounded-lg bg-[var(--color-bg-container)] px-3.5 py-2.5 leading-[1.9] text-[var(--color-text-primary)] shadow-[0_0_0_1px_var(--color-border-ring)]">
            <span className="block text-[11px] tracking-[0.1em] text-[var(--color-accent)]">
              笔记
            </span>
            {entry.text}
          </div>
        ) : (
          <>
            {strong ? (
              <b className="font-semibold text-[var(--color-text-primary)]">{entry.text}</b>
            ) : (
              entry.text
            )}
            {entry.refs.map(index => (
              <CiteMark key={index} index={index} />
            ))}
          </>
        )}
      </div>
    </li>
  );
});

TrailRow.displayName = "TrailRow";

export const QuestTrail = memo(({ trail }: { trail: QuestTrailEntry[] }) => (
  <CitationScope name="trail">
    <ol className="relative m-0 list-none p-0 before:absolute before:bottom-2 before:left-[76px] before:top-2 before:w-px before:bg-[var(--color-border-ring-heavy)]">
      {trail.map((entry, i) => (
        <TrailRow key={`${entry.time}-${i}`} entry={entry} />
      ))}
    </ol>
  </CitationScope>
));

QuestTrail.displayName = "QuestTrail";

const ReferenceItem = memo(
  ({ material, basePath }: { material: QuestMaterialData; basePath: string }) => {
    const citedIn = useCitedScopes(material.index);
    const isQuote = material.group === "external";

    return (
      <li
        id={refAnchorId(material.index)}
        className="grid scroll-mt-32 grid-cols-[36px_1fr] gap-1.5 rounded-md border-t border-[var(--color-border-ring)] px-2 py-3.5"
      >
        <span className="pt-0.5 font-mono text-[13px] text-[var(--color-accent)]">
          [{material.index}]
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-[var(--color-text-primary)]">
            {material.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <MaterialKindLabel kind={material.kind} meta={material.meta} />
            <MaterialLink material={material} basePath={basePath} />
            {citedIn.length > 0 && (
              <span className="text-xs text-[var(--color-text-quaternary)]">
                引用于
                {citedIn.map(scope => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => jumpToCitation(scope, material.index)}
                    className="ml-1.5 cursor-pointer border-0 bg-transparent p-0 text-xs text-[var(--color-accent)] hover:underline"
                  >
                    ↩ {SCOPE_LABELS[scope]}
                  </button>
                ))}
              </span>
            )}
          </div>
          {material.excerpt && (
            <p
              className={`mb-0 mt-2 border-l-2 border-[var(--color-border-ring-heavy)] pl-3 text-[13.5px] leading-[1.85] text-[var(--color-text-secondary)] ${
                isQuote
                  ? "font-['Songti_SC','STSong','Noto_Serif_SC','Source_Han_Serif_SC',serif]"
                  : ""
              }`}
            >
              {material.excerpt}
            </p>
          )}
          {material.note && (
            <p className="mb-0 mt-1.5 pl-3 text-[13px] leading-[1.8] text-[var(--color-text-tertiary)]">
              想法：{material.note}
            </p>
          )}
        </div>
      </li>
    );
  }
);

ReferenceItem.displayName = "ReferenceItem";

export const QuestReferences = memo(
  ({ materials, basePath }: { materials: QuestMaterialData[]; basePath: string }) => {
    const groups = (["external", "note", "discussion"] as const)
      .map(group => ({ group, items: materials.filter(material => material.group === group) }))
      .filter(({ items }) => items.length > 0);

    return (
      <div data-testid="quest-references">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <div className="mb-2 mt-7 text-xs tracking-[0.12em] text-[var(--color-text-tertiary)]">
              {GROUP_LABELS[group]}
            </div>
            <ol className="m-0 list-none p-0">
              {items.map(material => (
                <ReferenceItem key={material.index} material={material} basePath={basePath} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    );
  }
);

QuestReferences.displayName = "QuestReferences";

export const ResearchSection = memo(
  ({ kicker, children }: { kicker: ReactNode; children: ReactNode }) => (
    <section className="mt-16 border-t border-[var(--color-border-ring-heavy)] pt-6">
      {kicker}
      {children}
    </section>
  )
);

ResearchSection.displayName = "ResearchSection";
