/**
 * 创作模式的白板栏：按正文取素材板（没有时先问写作意图再建），挂画布；建板时先把文章已关联的资料摆成一组，
 * 再召集资料并按组摆上白板，
 * 移走召集来的资料记为「不要」；写作时亮起的那张在视野外时给一个指路胶囊。
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ArrowUpRight, Loader2, Sparkles, X } from "lucide-react";
import { Loading, cn, toast } from "@tau/ui";
import {
  BoardUtil,
  PathUtil,
  ViewPortTransforms,
  useBoard,
  useViewPort,
  type BoardElement,
  type DocumentElement,
  type WhiteboardSlots,
} from "@tau/whiteboard";
import { BoardCanvas } from "@/features/whiteboards/components/BoardCanvas";
import { DocumentReaderLayer } from "@/features/shared/whiteboard/components/Document/DocumentReader";
import {
  DocumentHostContext,
  type DocumentHost,
} from "@/features/shared/whiteboard/components/Document/DocumentHostContext";
import { getEntityContext } from "@/commands/entity-context";
import type { EntityRef, EntityRefKind } from "@/entity/ref";
import type { GatherGroup, GatherPhase, GatherResult } from "@/types/compose";
import {
  LINKED_GROUP_NAME,
  boundsOf,
  collectDocuments,
  layoutGather,
  removedGatheredKeys,
} from "../model";
import {
  cancelGather,
  useComposeBoard,
  useGather,
  useGatherEnabled,
  useGatherPhase,
} from "../queries";
import { useComposeSession, useComposeSessionApi } from "../session";
import { ComposeCardAccessory } from "./ComposeCardAccessory";
import { IntentButton, IntentCard } from "./IntentCard";

interface BoardActions {
  onRemoved(keys: string[]): void;
}

const BoardActionsContext = createContext<BoardActions>({ onRemoved: () => undefined });

const documentHost: DocumentHost = {
  allowDock: false,
  cardAccessory: (element: DocumentElement) => <ComposeCardAccessory element={element} />,
};

/** 画布容器内的层：登记白板实例、同步资料清单与识别移走 */
function ComposeCanvasLayer() {
  const board = useBoard();
  const session = useComposeSessionApi();
  const { onRemoved } = useContext(BoardActionsContext);

  useEffect(() => {
    session.setState({ board, documents: collectDocuments(board.children) });
    const onValueChange = (children: BoardElement[]) => {
      const before = session.getState().documents;
      const after = collectDocuments(children);
      session.setState({ documents: after });
      const removed = removedGatheredKeys(before, after);
      if (removed.length) onRemoved(removed);
    };
    board.on("onValueChange", onValueChange);
    return () => {
      board.off("onValueChange", onValueChange);
      if (session.getState().board === board) session.setState({ board: null, documents: [] });
    };
  }, [board, session, onRemoved]);

  return (
    <>
      <DocumentReaderLayer />
      <GlowPointer />
    </>
  );
}

/** 亮起的那张不在视野里时，画布顶部指路 */
function GlowPointer() {
  const board = useBoard();
  const viewPort = useViewPort();
  const glow = useComposeSession(state => state.glow);
  const documents = useComposeSession(state => state.documents);
  const element = glow ? BoardUtil.getElementById(board, glow.elementId) : null;
  if (!glow || !element) return null;
  const visible =
    element.x + element.width > viewPort.minX &&
    element.x < viewPort.minX + viewPort.width &&
    element.y + element.height > viewPort.minY &&
    element.y < viewPort.minY + viewPort.height;
  if (visible) return null;
  const title = documents.find(doc => doc.elementId === glow.elementId)?.title || "相关资料";
  return (
    <button
      type="button"
      data-whiteboard-overlay=""
      onClick={() => ViewPortTransforms.centerElementsIfNotInViewPort(board, [element])}
      className="bg-surface shadow-float text-tau-meta text-ink-2 hover:text-ink-1 absolute left-1/2 top-3 z-[7] flex max-w-[70%] -translate-x-1/2 items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2.5"
    >
      <span className="bg-accent size-1.5 shrink-0 rounded-full" />
      <span className="min-w-0 truncate">与这段相关：{title}</span>
      <ArrowUpRight className="size-3.5 shrink-0" strokeWidth={1.75} />
    </button>
  );
}

const slots: WhiteboardSlots = { CanvasLayer: ComposeCanvasLayer };

type GatherStatus =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; count: number; frameIds: string[] }
  | { state: "empty" };

function phaseText(phase: GatherPhase | null) {
  if (!phase) return "读你的写作意图…";
  if (phase.phase === "candidates") {
    return `在 ${phase.notes.toLocaleString()} 份内容里粗筛出 ${phase.candidates} 份`;
  }
  return "挑出值得放上来的，分好组…";
}

/** 文章已关联的资料（显式连接在前、正文里的引用在后），作为白板上的第一组 */
async function linkedGroup(hostRef: EntityRef): Promise<GatherGroup | null> {
  const context = await getEntityContext(hostRef).catch(() => null);
  const items = (context?.links ?? []).map(link => ({
    ref: link.entity.ref,
    contentId: link.contentId ?? 0,
    title: link.entity.title,
    why: "",
    heading: "",
    block: 0,
  }));
  return items.length ? { name: LINKED_GROUP_NAME, items } : null;
}

interface Placement {
  groups: GatherGroup[];
  gathered: boolean;
}

export function ComposeBoard({
  contentId,
  hostRef,
  initialIntent,
}: {
  contentId: number;
  /** 正在写的那篇（取已关联的资料） */
  hostRef: EntityRef;
  /** 意图卡的预填（已有正文时为标题 + 首段） */
  initialIntent: string;
}) {
  const session = useComposeSessionApi();
  const { board, loading, ensure, setIntent, dismiss } = useComposeBoard(contentId);
  const gather = useGather(contentId);
  const canGather = useGatherEnabled();
  const [status, setStatus] = useState<GatherStatus>({ state: "idle" });
  const phase = useGatherPhase(contentId, status.state === "running");
  /** 画布还没挂上时先排队，按到达顺序摆（已关联的总在召集结果之前） */
  const queue = useRef<Placement[]>([]);

  const flush = useMemoizedFn(() => {
    const target = session.getState().board;
    if (!target || !queue.current.length) return;
    const placements = queue.current;
    queue.current = [];
    for (const { groups, gathered } of placements) {
      const frames = layoutGather(groups, boundsOf(target.children), { gathered });
      if (!frames.length) {
        if (gathered) setStatus({ state: "empty" });
        continue;
      }
      target.apply(
        frames.map((node, index) => ({
          type: "insert_node" as const,
          path: [target.children.length + index],
          node,
        }))
      );
      ViewPortTransforms.fitAllElements(target, 80, true);
      if (gathered) {
        setStatus({
          state: "done",
          count: frames.reduce((sum, frame) => sum + frame.children.length, 0),
          frameIds: frames.map(frame => frame.id),
        });
      }
    }
  });
  const place = useMemoizedFn((placement: Placement) => {
    queue.current.push(placement);
    flush();
  });

  useEffect(() => session.subscribe(state => state.board && flush()), [session, flush]);

  const run = useMemoizedFn((intent: string, kinds: EntityRefKind[], more = false) => {
    setStatus({ state: "running" });
    gather.mutate(
      {
        intent,
        kinds,
        more,
        exclude: session.getState().documents.map(doc => doc.key),
      },
      {
        onSuccess: (result: GatherResult) => place({ groups: result.groups, gathered: true }),
        onError: error => {
          setStatus({ state: "idle" });
          toast.error(error instanceof Error ? error.message : "找资料失败");
        },
      }
    );
  });

  const undoAll = useMemoizedFn((frameIds: string[]) => {
    const target = session.getState().board;
    if (!target) return;
    // 从后往前删，前面的路径不受影响
    const removals = frameIds
      .map(id => BoardUtil.getElementById(target, id))
      .flatMap(element => {
        const path = element ? PathUtil.getPathByElement(target, element) : null;
        return element && path ? [{ type: "remove_node" as const, path, node: element }] : [];
      })
      .sort((a, b) => b.path[0] - a.path[0]);
    target.apply(removals);
    setStatus({ state: "idle" });
  });

  // 「done」胶囊几秒后收起
  useEffect(() => {
    if (status.state !== "done" && status.state !== "empty") return;
    const timer = window.setTimeout(() => setStatus({ state: "idle" }), 8000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const placeLinked = useMemoizedFn(async () => {
    const group = await linkedGroup(hostRef);
    if (group) place({ groups: [group], gathered: false });
  });

  const actions = useRef<BoardActions>({
    onRemoved: keys => dismiss.mutate(keys),
  }).current;

  if (loading) return <Loading />;

  return (
    <DocumentHostContext.Provider value={documentHost}>
      <BoardActionsContext.Provider value={actions}>
        <div className="relative h-full w-full">
          {board ? (
            <BoardCanvas id={board.pageId} slots={slots} />
          ) : (
            <div className="bg-page h-full w-full bg-[radial-gradient(var(--tau-line-1)_1px,transparent_1.2px)] [background-size:20px_20px]" />
          )}
          {!board && (
            <IntentCard
              initialIntent={initialIntent}
              canGather={canGather}
              busy={ensure.isPending}
              onSkip={() => ensure.mutate("", { onSuccess: () => void placeLinked() })}
              onStart={(intent, kinds) =>
                ensure.mutate(intent, {
                  onSuccess: async () => {
                    await placeLinked();
                    if (canGather) run(intent, kinds);
                  },
                })
              }
            />
          )}
          {board && canGather && (
            <div className="absolute right-3 top-3 z-[6] flex items-center gap-1.5">
              <IntentButton intent={board.intent} onChange={intent => setIntent.mutate(intent)} />
              {status.state === "idle" && (
                <button
                  type="button"
                  onClick={() => run(board.intent, [], true)}
                  title="按写作意图和已经写的内容再找一轮"
                  className="bg-surface shadow-card text-tau-meta text-accent-text hover:bg-surface-hover inline-flex h-[30px] items-center gap-1.5 rounded-full px-3"
                >
                  <Sparkles className="size-3.5" strokeWidth={1.75} />
                  再找一些
                </button>
              )}
            </div>
          )}
          {status.state !== "idle" && (
            <div
              role="status"
              className={cn(
                "bg-surface shadow-float text-tau-meta text-ink-2 absolute left-1/2 top-3 z-[6] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-3 pr-2"
              )}
            >
              {status.state === "running" ? (
                <>
                  <Loader2 className="text-accent size-3.5 animate-spin" strokeWidth={1.75} />
                  {phaseText(phase)}
                  <button
                    type="button"
                    title="取消"
                    onClick={() => {
                      void cancelGather(contentId);
                      setStatus({ state: "idle" });
                    }}
                    className="text-ink-3 hover:text-ink-1 ml-1"
                  >
                    <X className="size-3.5" strokeWidth={1.75} />
                  </button>
                </>
              ) : status.state === "done" ? (
                <>
                  <span className="bg-ok size-2 rounded-full" />
                  {status.count} 份资料已摆上白板 · 不要的直接移走
                  <button
                    type="button"
                    onClick={() => undoAll(status.frameIds)}
                    className="text-accent-text hover:underline"
                  >
                    撤销全部
                  </button>
                </>
              ) : (
                <>
                  <span className="bg-ink-3 size-2 rounded-full" />
                  没有找到更多相关的资料
                </>
              )}
            </div>
          )}
        </div>
      </BoardActionsContext.Provider>
    </DocumentHostContext.Provider>
  );
}
