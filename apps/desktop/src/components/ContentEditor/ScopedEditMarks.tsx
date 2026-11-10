import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Editor, Element, Text, type NodeEntry, type Range } from "slate";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { EditorProps, MarkRenderProps } from "@tau/editor";
import { cn } from "@tau/ui";
import { captureScopedTextEdit, NodeTree, type ScopedContentEdit } from "@tau/collaboration";
import { useFocusedContentSuggestion } from "@/services/content-editing/suggestion-queries";
import { agentColorStyle } from "@/services/agent-identity";
import { SUGGESTION_MARK_ATTR, useSuggestionFocus } from "@/components/ContentReview/actions";
import { agentNameOf } from "@/components/ContentReview/model";
import type { ContentSuggestion } from "@/types/content-suggestion";
import type { AgentAwarenessState } from "@/types/agent-presence";
import { resolveHistoricalTextRange } from "./suggestionPreview";

/** 痕迹样式：del 待处理改动的原文；recent 刚接受的新文字；anchor 提问锚点 */
type MarkStyle = "del" | "recent" | "anchor";
interface MarkData {
  id: string;
  agent: string;
  style: MarkStyle;
  active: boolean;
  title: string;
}
/**
 * 幽灵字：待处理改动的新文字，画在原文末尾（纯插入时画在插入点前一个字之后）；
 * 「看改动」时是被替换掉的原文（strike），画在新文字前面。
 */
interface GhostData {
  id: string;
  agent: string;
  text: string;
  before?: boolean;
  strike?: boolean;
  leafStart?: number;
}

const MARK = "agentSuggestionMark";
const GHOST = "agentSuggestionGhost";
/** Agent 此刻在看 / 在改的块（来自 awareness），与建议痕迹分开叠放 */
const ACTIVITY = "agentActivityMark";
const GHOST_LIMIT = 240;

type TextTarget = { block: string; start: number; end: number; mark?: MarkData; ghost?: GhostData };
type BlockTarget = { roots: Set<string>; mark: MarkData };
interface ActivityData {
  agent: string;
  editing: boolean;
  title: string;
}
type ActivityTarget = { block: string; activity: ActivityData };

/** awareness 里在场 Agent 的块级动作：正在看（点状下划线）/ 正在改（整块淡色圈出） */
function useAgentActivity(awareness: Awareness | undefined) {
  const [targets, setTargets] = useState<ActivityTarget[]>([]);
  useEffect(() => {
    if (!awareness) {
      setTargets(previous => (previous.length ? [] : previous));
      return;
    }
    const read = () => {
      const next: ActivityTarget[] = [];
      for (const state of awareness.getStates().values()) {
        const user = state?.user as { agent?: boolean; name?: string } | undefined;
        const agent = state?.agent as AgentAwarenessState | undefined;
        if (!user?.agent || typeof user.name !== "string" || typeof agent?.block !== "string")
          continue;
        next.push({
          block: agent.block,
          activity: {
            agent: user.name,
            editing: Boolean(agent.editing),
            title: `${user.name} ${agent.action ?? ""}`.trim(),
          },
        });
      }
      setTargets(previous => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    read();
    awareness.on("change", read);
    return () => awareness.off("change", read);
  }, [awareness]);
  return targets;
}

const decodePosition = (tree: NodeTree, position: string) =>
  tree.resolvePosition(Y.createRelativePositionFromJSON(JSON.parse(position)));

/** 解析文本锚点并核对当前文字；渲染端的文档可能比主进程新（刚打的字还在途），对不上就不画 */
function resolveText(tree: NodeTree, edit: Extract<ScopedContentEdit, { kind: "text" }>) {
  try {
    const start = decodePosition(tree, edit.start);
    const end = decodePosition(tree, edit.end);
    if (start?.parent !== edit.blockId || end?.parent !== edit.blockId || start.offset > end.offset)
      return null;
    const current = captureScopedTextEdit(
      tree,
      edit.id,
      edit.blockId,
      start.offset,
      end.offset,
      ""
    );
    if (
      current.expected.map(run => run.text).join("") !== edit.expected.map(run => run.text).join("")
    )
      return null;
    return { start: start.offset, end: end.offset };
  } catch {
    return null;
  }
}

const blockLength = (tree: NodeTree, block: string) =>
  tree.spans(block).reduce((length, span) => length + span.length, 0);

function targetsOf(
  tree: NodeTree,
  entry: ContentSuggestion,
  activeId: string | undefined,
  viewing: boolean,
  rebuilt: boolean
): { texts: TextTarget[]; blocks: BlockTarget[] } {
  const agent = agentNameOf(entry);
  const edit = viewing ? entry.applied : entry.edit;
  const style: MarkStyle = entry.kind === "question" ? "anchor" : viewing ? "recent" : "del";
  const mark: MarkData = {
    id: entry.id,
    agent,
    style,
    active: entry.id === activeId,
    title:
      style === "anchor"
        ? `${agent} 问你：${entry.reason ?? ""}`
        : style === "recent"
          ? `${agent} 的修改记录`
          : `${agent} 建议${entry.afterText ? `改为「${entry.afterText.slice(0, 60)}」` : "删除"}`,
  };
  if (!edit) return { texts: [], blocks: [] };
  if (edit.kind === "blocks") {
    if (!edit.expected.length) return { texts: [], blocks: [] };
    const roots = new Set(
      edit.expected.map(node => node.collabId).filter(id => tree.rootBlockId(id))
    );
    return { texts: [], blocks: roots.size ? [{ roots, mark }] : [] };
  }
  const range = rebuilt ? resolveHistoricalTextRange(tree, edit) : resolveText(tree, edit);
  if (!range) return { texts: [], blocks: [] };
  const texts: TextTarget[] = [];
  const replaced = viewing ? entry.beforeText.replace(/\s+/g, " ").slice(0, GHOST_LIMIT) : "";
  // 旧文沿用新文的装饰范围，避免为了定位旧文而切出新文首字。
  if (range.end > range.start)
    texts.push({
      block: edit.blockId,
      ...range,
      mark,
      ghost: replaced
        ? { id: entry.id, agent, text: replaced, before: true, strike: true }
        : undefined,
    });
  const insert = style === "del" ? entry.afterText.replace(/\s+/g, " ").slice(0, GHOST_LIMIT) : "";
  if (insert) {
    const ghost: GhostData = { id: entry.id, agent, text: insert };
    if (range.end > 0)
      texts.push({ block: edit.blockId, start: range.end - 1, end: range.end, ghost });
    else if (blockLength(tree, edit.blockId) > 0)
      texts.push({ block: edit.blockId, start: 0, end: 1, ghost: { ...ghost, before: true } });
  }
  return { texts, blocks: [] };
}

/** 正文显示的条目：待处理（含提交中）的改动、待回答的提问和正在主动回看的改动 */
const displayed = (entry: ContentSuggestion) =>
  ((entry.status === "pending" || entry.status === "applying") && entry.kind === "edit") ||
  (entry.status === "pending" && entry.kind === "question") ||
  (Boolean(entry.applied) && entry.status === "accepted");

const MARK_CLASS: Record<MarkStyle, string> = {
  del: "text-ink-3 line-through decoration-[var(--agent)] decoration-[1.5px]",
  recent:
    "rounded-[3px] bg-[color-mix(in_oklch,var(--agent)_14%,transparent)] transition-colors duration-700",
  anchor:
    "bg-[color-mix(in_oklch,var(--agent)_14%,transparent)] underline decoration-[var(--agent)] decoration-2 underline-offset-[5px]",
};

/**
 * 按主进程建议记录在正文上画 Agent 的修订痕迹，颜色 = 作者：待处理改动的原文删除线 + 新文字幽灵字，
 * 主动回看的改动淡色底，提问的锚点下划线。锚点对不上当前正文的不画（主进程会把它标为过期）。
 */
export function useScopedEditMarks(
  contentId: number | undefined,
  doc: Y.Doc | undefined,
  awareness: Awareness | undefined,
  article: unknown,
  getEditor: () => Editor | undefined,
  decorate?: EditorProps["decorate"],
  wrapper?: EditorProps["leafWrapper"]
) {
  const activity = useAgentActivity(awareness);
  const activeId = useSuggestionFocus(state => state.focused?.id);
  const { data: suggestion } = useFocusedContentSuggestion(contentId, activeId);
  const targets = useMemo(() => {
    const empty = { texts: new Map<string, TextTarget[]>(), blocks: [] as BlockTarget[] };
    if (!doc || doc.isDestroyed || !suggestion || !displayed(suggestion)) return empty;
    const meta = doc.getMap("meta");
    const rebuilt =
      suggestion.baselineId !== meta.get("baselineId") || suggestion.epoch !== meta.get("epoch");
    if (
      suggestion.id !== activeId ||
      suggestion.documentId !== meta.get("documentId") ||
      (suggestion.status !== "accepted" && rebuilt)
    )
      return empty;
    const tree = new NodeTree(doc);
    try {
      const { texts, blocks } = targetsOf(
        tree,
        suggestion,
        activeId,
        suggestion.status === "accepted",
        rebuilt
      );
      for (const target of texts)
        empty.texts.set(target.block, [...(empty.texts.get(target.block) ?? []), target]);
      empty.blocks.push(...blocks);
      return empty;
    } finally {
      tree.dispose();
    }
    // article 随每次正文变化重新发布：锚点要按最新正文重新解析
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, article, suggestion, activeId]);

  const hasTargets = targets.texts.size > 0 || targets.blocks.length > 0 || activity.length > 0;
  const decorateScoped = (entry: NodeEntry): Range[] => {
    const ranges = decorate?.(entry) ?? [];
    const [node, path] = entry;
    const editor = getEditor();
    if (
      !hasTargets ||
      !editor ||
      !Text.isText(node) ||
      !path.length ||
      !Editor.hasPath(editor, path)
    )
      return ranges;
    const marks: Range[] = [];
    if (activity.length && node.text.length) {
      for (const [ancestor] of Editor.levels(editor, { at: path, reverse: true })) {
        if (!Element.isElement(ancestor) || !("collabId" in ancestor)) continue;
        const target = activity.find(item => item.block === ancestor.collabId);
        if (!target) continue;
        marks.push({
          anchor: { path, offset: 0 },
          focus: { path, offset: node.text.length },
          ...{ [ACTIVITY]: target.activity },
        });
        break;
      }
    }
    if (targets.blocks.length) {
      for (const [ancestor] of Editor.levels(editor, { at: path, reverse: true })) {
        if (!Element.isElement(ancestor) || !("collabId" in ancestor)) continue;
        const block = targets.blocks.find(target => target.roots.has(ancestor.collabId as string));
        if (!block) continue;
        if (node.text.length)
          marks.push({
            anchor: { path, offset: 0 },
            focus: { path, offset: node.text.length },
            ...{ [MARK]: block.mark },
          });
        break;
      }
    }
    const [parent] = Editor.parent(editor, path);
    if (Element.isElement(parent) && "collabId" in parent) {
      const offset = parent.children
        .slice(0, path.at(-1)!)
        .reduce((length, child) => length + (Text.isText(child) ? child.text.length : 1), 0);
      for (const target of targets.texts.get(parent.collabId as string) ?? []) {
        const start = Math.max(0, target.start - offset);
        const end = Math.min(node.text.length, target.end - offset);
        if (start >= end) continue;
        let ghost = target.ghost;
        if (ghost && target.mark)
          ghost = target.start >= offset ? { ...ghost, leafStart: start } : undefined;
        marks.push({
          anchor: { path, offset: start },
          focus: { path, offset: end },
          ...(target.mark ? { [MARK]: target.mark } : {}),
          ...(ghost ? { [GHOST]: ghost } : {}),
        });
      }
    }
    return [...ranges, ...marks];
  };

  const focus = useSuggestionFocus(state => state.focus);
  const wrapLeaf = useMemo(
    () =>
      function ScopedLeaf(props: MarkRenderProps) {
        const Wrapper = wrapper;
        const values = props.leaf as unknown as Record<string, unknown>;
        const mark = values[MARK] as MarkData | undefined;
        const ghost = values[GHOST] as GhostData | undefined;
        const activityMark = values[ACTIVITY] as ActivityData | undefined;
        // 幽灵字放在痕迹外面：放进删除线的 span 会被一起划掉
        let children = mark ? (
          <span
            {...{ [SUGGESTION_MARK_ATTR]: mark.id }}
            title={mark.title}
            style={agentColorStyle(mark.agent)}
            className={cn(
              MARK_CLASS[mark.style],
              mark.active &&
                "rounded-[3px] outline-2 outline-offset-1 outline-[color-mix(in_oklch,var(--agent)_45%,transparent)]"
            )}
            onClick={() => focus(mark.id, "mark")}
          >
            {props.children}
          </span>
        ) : (
          props.children
        );
        if (ghost && (ghost.leafStart === undefined || ghost.leafStart === props.leafStart)) {
          const ghostNode = (
            <span
              contentEditable={false}
              aria-hidden
              {...{ [SUGGESTION_MARK_ATTR]: mark ? undefined : ghost.id }}
              style={
                {
                  ...agentColorStyle(ghost.agent),
                  "--suggestion-ghost": JSON.stringify(ghost.text),
                } as CSSProperties
              }
              className={cn(
                "cursor-pointer select-none after:content-[var(--suggestion-ghost)]",
                ghost.strike
                  ? "after:text-ink-3 after:line-through after:decoration-[var(--agent)] after:decoration-[1.5px]"
                  : "after:rounded-[3px] after:bg-[color-mix(in_oklch,var(--agent)_10%,transparent)] after:text-[var(--agent)] after:underline after:decoration-[var(--agent)] after:decoration-[1.5px] after:underline-offset-4"
              )}
              onMouseDown={event => {
                event.preventDefault();
                focus(ghost.id, "mark");
              }}
            />
          );
          children = ghost.before ? (
            <>
              {ghostNode}
              {children}
            </>
          ) : (
            <>
              {children}
              {ghostNode}
            </>
          );
        }
        if (activityMark)
          children = (
            <span
              title={activityMark.title}
              style={agentColorStyle(activityMark.agent)}
              className={
                activityMark.editing
                  ? "rounded-[3px] bg-[color-mix(in_oklch,var(--agent)_10%,transparent)] shadow-[0_0_0_2px_color-mix(in_oklch,var(--agent)_10%,transparent)]"
                  : "underline decoration-[var(--agent)] decoration-dotted decoration-[1.5px] underline-offset-[5px]"
              }
            >
              {children}
            </span>
          );
        return Wrapper ? <Wrapper {...props}>{children}</Wrapper> : children;
      },
    [wrapper, focus]
  );
  return {
    decorate: hasTargets ? decorateScoped : decorate,
    leafWrapper: hasTargets ? wrapLeaf : wrapper,
  };
}
