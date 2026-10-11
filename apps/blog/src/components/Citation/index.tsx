/**
 * 求索录的引用标记：正文 / 轨迹里的 [n]，悬停预览资料，点击跳到「据」中对应条目。
 *
 * CitationProvider 提供资料表；CitationScope 标出引用所在的区域（解 / 径），
 * 只有处于某个 scope 内的引用才渲染编号，并登记被引用的区域，供资料条目的「↩」跳回。
 */
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Tooltip } from "@tau/ui";
import { joinPath } from "@blog/utils";
import type { QuestMaterialData, QuestMaterialKind } from "@blog/types";

export type CitationScopeName = "answer" | "trail";

export const MATERIAL_KIND_LABELS: Record<QuestMaterialKind, string> = {
  card: "卡片",
  article: "文章",
  project_item: "项目文档",
  project: "项目",
  white_board: "白板",
  excerpt: "划线",
  "pdf-annotation": "PDF 标注",
  "web-clip": "剪藏",
  "chat-session": "对话",
};

const KIND_DOT_CLASS: Record<QuestMaterialKind, string> = {
  card: "bg-[var(--tau-tag-1)]",
  article: "bg-[var(--tau-tag-3)]",
  project_item: "bg-[var(--tau-tag-3)]",
  project: "bg-[var(--color-text-quaternary)]",
  white_board: "bg-[var(--color-text-quaternary)]",
  excerpt: "bg-[var(--tau-tag-4)]",
  "pdf-annotation": "bg-[var(--tau-tag-5)]",
  "web-clip": "bg-[var(--tau-tag-2)]",
  "chat-session": "bg-[var(--color-accent)]",
};

type CitationRegistry = Record<CitationScopeName, Set<number>>;

interface CitationContextValue {
  basePath: string;
  byIndex: Map<number, QuestMaterialData>;
  byCiteKey: Map<string, number>;
  register(scope: CitationScopeName, index: number): void;
}

const CitationContext = createContext<CitationContextValue | null>(null);
const CitationScopeContext = createContext<CitationScopeName | null>(null);
const CitedScopesContext = createContext<CitationRegistry | null>(null);

export const refAnchorId = (index: number) => `ref-${index}`;

/** 滚动到目标并短暂高亮，提示读者落点 */
function flashInto(target: HTMLElement | null) {
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("citation-flash");
  void target.offsetWidth;
  target.classList.add("citation-flash");
}

export const jumpToReference = (index: number) =>
  flashInto(document.getElementById(refAnchorId(index)));

/** 跳回某区域里该资料的第一处引用 */
export const jumpToCitation = (scope: CitationScopeName, index: number) =>
  flashInto(
    document.querySelector<HTMLElement>(`[data-cite-scope="${scope}"][data-cite-index="${index}"]`)
  );

export function CitationProvider({
  materials,
  basePath,
  children,
}: {
  materials: QuestMaterialData[];
  basePath: string;
  children: ReactNode;
}) {
  const [cited, setCited] = useState<CitationRegistry>(() => ({
    answer: new Set(),
    trail: new Set(),
  }));
  const register = useCallback((scope: CitationScopeName, index: number) => {
    setCited(previous => {
      if (previous[scope].has(index)) return previous;
      return { ...previous, [scope]: new Set(previous[scope]).add(index) };
    });
  }, []);
  const value = useMemo<CitationContextValue>(
    () => ({
      basePath,
      byIndex: new Map(materials.map(material => [material.index, material])),
      byCiteKey: new Map(
        materials.flatMap(material =>
          material.citeKey ? [[material.citeKey, material.index] as const] : []
        )
      ),
      register,
    }),
    [basePath, materials, register]
  );

  return (
    <CitationContext.Provider value={value}>
      <CitedScopesContext.Provider value={cited}>{children}</CitedScopesContext.Provider>
    </CitationContext.Provider>
  );
}

export function CitationScope({
  name,
  children,
}: {
  name: CitationScopeName;
  children: ReactNode;
}) {
  return <CitationScopeContext.Provider value={name}>{children}</CitationScopeContext.Provider>;
}

/** 资料条目用：该资料在哪些区域被引用过 */
export function useCitedScopes(index: number): CitationScopeName[] {
  const cited = useContext(CitedScopesContext);
  if (!cited) return [];
  return (["answer", "trail"] as const).filter(scope => cited[scope].has(index));
}

/** content-link 用：指向本问题资料的链接返回其编号，不在引用区域内时为 null */
export function useCitationIndex(citeKey: string): number | null {
  const context = useContext(CitationContext);
  const scope = useContext(CitationScopeContext);
  if (!context || !scope) return null;
  return context.byCiteKey.get(citeKey) ?? null;
}

export const MaterialKindLabel = memo(
  ({ kind, meta }: { kind: QuestMaterialKind; meta?: string }) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.06em] text-[var(--color-text-tertiary)]">
      <i className={`h-1.5 w-1.5 rounded-[2px] ${KIND_DOT_CLASS[kind]}`} />
      {[MATERIAL_KIND_LABELS[kind], meta].filter(Boolean).join(" · ")}
    </span>
  )
);

MaterialKindLabel.displayName = "MaterialKindLabel";

/** 资料的去处：站内页面 → / 外部原处 ↗；都没有时标注未公开 */
export const MaterialLink = memo(
  ({ material, basePath }: { material: QuestMaterialData; basePath: string }) => {
    const linkClass =
      "text-xs text-[var(--color-text-tertiary)] underline decoration-[var(--color-border-ring-heavy)] underline-offset-[3px] hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]";
    if (material.href) {
      return (
        <a className={linkClass} href={joinPath(basePath, material.href)}>
          打开{MATERIAL_KIND_LABELS[material.kind]} →
        </a>
      );
    }
    if (material.url) {
      return (
        <a className={linkClass} href={material.url} target="_blank" rel="noopener nofollow">
          查看原处 ↗
        </a>
      );
    }
    if (material.group === "note") {
      return (
        <span className="rounded border border-dashed border-[var(--color-border-ring-heavy)] px-1.5 text-[11px] text-[var(--color-text-quaternary)]">
          未公开
        </span>
      );
    }
    return null;
  }
);

MaterialLink.displayName = "MaterialLink";

const CitationPreview = memo(
  ({ material, basePath }: { material: QuestMaterialData; basePath: string }) => (
    <div className="w-[340px] max-w-[80vw] px-4 py-3 text-[13px] leading-[1.7]">
      <MaterialKindLabel kind={material.kind} meta={material.meta} />
      <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
        {material.title}
      </div>
      {material.excerpt && (
        <p className="mt-2 line-clamp-4 border-l-2 border-[var(--color-border-ring-heavy)] pl-3 text-[var(--color-text-secondary)]">
          {material.excerpt}
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-text-tertiary)]">点击编号查看资料</span>
        <MaterialLink material={material} basePath={basePath} />
      </div>
    </div>
  )
);

CitationPreview.displayName = "CitationPreview";

export const CiteMark = memo(({ index }: { index: number }) => {
  const context = useContext(CitationContext);
  const scope = useContext(CitationScopeContext);
  const material = context?.byIndex.get(index);
  const register = context?.register;

  useEffect(() => {
    if (scope && material) register?.(scope, index);
  }, [index, material, register, scope]);

  if (!context || !scope || !material) return null;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();
    jumpToReference(index);
  };

  return (
    <Tooltip
      placement="bottom"
      arrow={false}
      delay={250}
      className="bg-page text-ink-1 border-line-1 shadow-card overflow-hidden rounded-lg border p-0"
      content={<CitationPreview material={material} basePath={context.basePath} />}
    >
      <a
        href={`#${refAnchorId(index)}`}
        onClick={handleClick}
        data-cite-scope={scope}
        data-cite-index={index}
        contentEditable={false}
        className="mx-px scroll-mt-32 rounded-[3px] px-px align-super font-mono text-[0.68em] font-semibold leading-none text-[var(--color-accent)] no-underline hover:bg-[var(--color-accent-subtle)]"
      >
        [{index}]
      </a>
    </Tooltip>
  );
});

CiteMark.displayName = "CiteMark";
