/**
 * 创作模式接入 7b 洞见视图（18 §3.8），按钮叫「标出可引用处」：白板上的资料全部作为候选；打开时白板卡片
 * 按标记编号、其余降淡，当前一处指向的那张描边；报告卡开头一句「正文里有 N 处可以引用白板上的资料，
 * 还有 M 份没用到」；气泡里白板外的对方可以「放到白板」。
 */

import { useCallback, useEffect, type ReactNode } from "react";
import { v4 as getUuid } from "uuid";
import { LayoutDashboard } from "lucide-react";
import { useStore } from "zustand";
import { DOCUMENT_DEFAULT_SIZE, ViewPortTransforms, type DocumentElement } from "@tau/whiteboard";
import { entityRefKey, type EntityRef } from "@/entity/ref";
import type { InsightMark } from "@/types/content-insights";
import type { ComposeSession } from "./session";
import { isBoardDocumentRef } from "./model";

/** 洞见视图的输出里创作模式要用的部分 */
interface InsightsState {
  openMarks: InsightMark[];
  current: string | null;
}

export const COMPOSE_INSIGHTS_COPY = {
  label: "标出可引用处",
  title: "AI 通读正文，标出哪些话可以引用白板上的资料，并列出还没用到的资料",
};

function Headline({ session }: { session: ComposeSession }) {
  const documents = useStore(session, state => state.documents);
  const cited = useStore(session, state => state.cited);
  const numbers = useStore(session, state => state.numbers);
  const citable = useStore(session, state => state.citable);
  const unused = documents.filter(doc => !cited.has(doc.key) && !numbers.has(doc.key));
  const flash = () => {
    const board = session.getState().board;
    unused.forEach(doc => board?.flashElement(doc.elementId));
  };
  return (
    <p className="text-tau-body-lg text-ink-1 mb-1.5 font-medium leading-[1.8]">
      {citable
        ? `正文里有 ${citable} 处可以引用白板上的资料`
        : "正文里暂时没有找到可以引用白板资料的地方"}
      {unused.length > 0 && (
        <>
          ，还有{" "}
          <button
            type="button"
            onClick={flash}
            title="在白板上闪一下这几份"
            className="text-accent-text inline-flex items-center gap-1 hover:underline"
          >
            <LayoutDashboard className="size-3.5" strokeWidth={1.75} />
            {unused.length} 份没用到
          </button>
        </>
      )}
      。
    </p>
  );
}

function PlaceOnBoard({ session, mark }: { session: ComposeSession; mark: InsightMark }) {
  const target = mark.target;
  const onBoard = useStore(session, state =>
    target ? state.documents.some(doc => doc.key === entityRefKey(target.ref)) : true
  );
  if (!target || onBoard || !isBoardDocumentRef(target.ref)) return null;
  const ref = target.ref;
  return (
    <span
      role="button"
      tabIndex={0}
      title="放到白板"
      onClick={event => {
        event.stopPropagation();
        const board = session.getState().board;
        if (!board) return;
        const size = DOCUMENT_DEFAULT_SIZE[ref.kind];
        const element: DocumentElement = {
          id: getUuid(),
          type: "document",
          entityRef: ref,
          title: target.title,
          x: board.viewPort.minX + board.viewPort.width / 2 - size.width / 2,
          y: board.viewPort.minY + board.viewPort.height / 2 - size.height / 2,
          ...size,
        };
        board.apply({ type: "insert_node", path: [board.children.length], node: element });
        ViewPortTransforms.centerElementsIfNotInViewPort(board, [element]);
      }}
      className="text-ink-3 hover:text-accent-text ml-auto shrink-0"
    >
      <LayoutDashboard className="size-[13px]" strokeWidth={1.75} />
    </span>
  );
}

/** 传给 useInsightsView 的选项；不在创作模式时为空 */
export function useComposeInsightOptions(
  session: ComposeSession,
  active: boolean
): {
  getSeed?: () => EntityRef[];
  reportExtra?: ReactNode;
  targetAction?: (mark: InsightMark) => ReactNode;
  copy?: typeof COMPOSE_INSIGHTS_COPY;
} {
  const getSeed = useCallback(() => session.getState().documents.map(doc => doc.ref), [session]);
  const targetAction = useCallback(
    (mark: InsightMark) => <PlaceOnBoard session={session} mark={mark} />,
    [session]
  );
  if (!active) return {};
  return {
    getSeed,
    targetAction,
    reportExtra: <Headline session={session} />,
    copy: COMPOSE_INSIGHTS_COPY,
  };
}

/** 洞见视图的标记 → 白板卡片编号与当前描边 */
export function useComposeInsightSync(
  session: ComposeSession,
  active: boolean,
  insights: InsightsState
) {
  const { openMarks, current } = insights;
  useEffect(() => {
    if (!active || !openMarks.length) {
      session.setState({ numbers: new Map(), focusKey: null, citable: 0 });
      return;
    }
    const numbers = new Map<string, number>();
    const onBoard = openMarks.filter(
      mark => mark.seeded && mark.target && (mark.kind === "link" || mark.kind === "dup")
    );
    onBoard
      .sort((a, b) => a.block - b.block)
      .forEach(mark => {
        const key = entityRefKey(mark.target!.ref);
        if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
      });
    const focused = openMarks.find(mark => mark.id === current)?.target;
    session.setState({
      numbers,
      focusKey: focused ? entityRefKey(focused.ref) : null,
      citable: onBoard.length,
    });
  }, [active, openMarks, current, session]);
}
