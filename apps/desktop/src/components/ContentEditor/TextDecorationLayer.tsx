import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PluginTextDecorationCandidate } from "@tau/plugins";
import { AnchoredPanel, Popover, cn, toast } from "@tau/ui";
import type { DecorationHit } from "@/app/plugins/text-decorations";
import type { TextDecorationView } from "./text-decoration-view";

import { useDecorationHover } from "./useDecorationHover";
const PreviewContent = lazy(() => import("@/editor-extensions/content-link/components/Content"));

interface Choosing {
  hit: DecorationHit;
  anchor: HTMLElement;
  candidates: readonly PluginTextDecorationCandidate[];
}

function mark(view: TextDecorationView, hit: DecorationHit, name: "hot" | "busy", on: boolean) {
  for (const element of view.elementsOf(hit)) element.toggleAttribute(`data-${name}`, on);
}

/** 宿主统一绘制的悬停提示与同名候选菜单，插件只提供文案和候选数据。 */
export function TextDecorationLayer({
  view,
  allowPreview = true,
}: {
  view: TextDecorationView;
  allowPreview?: boolean;
}) {
  const { hover: tip, show, clear: clearHover, leave, keep } = useDecorationHover(allowPreview);
  const [choosing, setChoosing] = useState<Choosing | null>(null);
  const [index, setIndex] = useState(0);
  const hovered = useRef<DecorationHit | null>(null);
  const busy = useRef(new Set<DecorationHit>());
  const choose = useRef<(choice: Choosing, candidate: PluginTextDecorationCandidate) => void>(
    () => undefined
  );
  const choosingRef = useRef(choosing);
  choosingRef.current = choosing;

  useEffect(() => {
    const run = async (hit: DecorationHit, anchor: HTMLElement, choice?: string) => {
      if (busy.current.has(hit) || !hit.activate || hit.lifetime?.aborted) return;
      busy.current.add(hit);
      mark(view, hit, "busy", true);
      clearHover();
      try {
        const candidates = await hit.activate(choice);
        if (candidates?.length && anchor.isConnected) {
          setIndex(0);
          setChoosing({ hit, anchor, candidates });
          mark(view, hit, "hot", true);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "文字标记操作失败");
      } finally {
        busy.current.delete(hit);
        mark(view, hit, "busy", false);
      }
    };
    view.layer = {
      hover(hit, element) {
        if (choosingRef.current?.hit === hit) return;
        if (hovered.current && hovered.current !== hit) mark(view, hovered.current, "hot", false);
        hovered.current = element ? hit : null;
        mark(view, hit, "hot", !!element);
        if (!element) {
          leave();
          return;
        }
        show(hit, element);
      },
      activate: (hit, element) => void run(hit, element),
    };
    choose.current = (choice: Choosing, candidate: PluginTextDecorationCandidate) => {
      mark(view, choice.hit, "hot", false);
      setChoosing(null);
      void run(choice.hit, choice.anchor, candidate.key);
    };
    // 按住 ⌘/Ctrl 时所有装饰显形，方便扫一眼哪些可点。
    const root = document.documentElement;
    const sync = (event: globalThis.KeyboardEvent) =>
      root.toggleAttribute("data-tau-decoration-mod", event.metaKey || event.ctrlKey);
    const clear = () => root.removeAttribute("data-tau-decoration-mod");
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", clear);
    return () => {
      clearHover();
      view.layer = undefined;
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [view, show, leave, clearHover]);

  const close = (current = choosing) => {
    clearHover();
    if (!current) return;
    mark(view, current.hit, "hot", false);
    setChoosing(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!choosing || event.nativeEvent.isComposing) return;
    const count = choosing.candidates.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (index + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
      setIndex(next);
      const anchor = event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')[next];
      if (anchor) show(choosing.hit, anchor, choosing.candidates[next].key);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose.current(choosing, choosing.candidates[index]);
    }
  };

  useEffect(() => {
    if (!choosing?.hit.lifetime) return;
    const cancel = () => setChoosing(null);
    const signal = choosing.hit.lifetime;
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    return () => signal.removeEventListener("abort", cancel);
  }, [choosing]);
  const preview = tip?.preview;
  const card = preview && (
    <Suspense fallback={null}>
      <PreviewContent
        content={{
          id: preview.target.ref.id,
          updateTime: preview.snapshot.updatedAt,
          count: preview.snapshot.wordCount,
          contracts: preview.snapshot.contracts,
          content: preview.snapshot.nodes!.slice(preview.target.at?.block ?? 0),
        }}
        contentType={
          preview.target.ref.kind === "document" ? "project-item" : preview.target.ref.kind
        }
        contentTitle={preview.title}
        unshared={false}
        onOpen={() => {
          void preview
            .open()
            .catch(error => toast.error(error instanceof Error ? error.message : "打开内容失败"))
            .finally(() => close());
        }}
      />
    </Suspense>
  );
  return (
    <>
      <AnchoredPanel
        anchor={tip && tip.choice === undefined ? tip.anchor : null}
        open={!!tip}
        placement="bottom-start"
        role={preview ? undefined : "tooltip"}
        onPointerEnter={keep}
        onPointerLeave={leave}
        className={
          preview
            ? "w-[380px] max-w-[min(380px,calc(100vw-16px))]"
            : "bg-ink-1 text-ink-inverse border-ink-inverse/15 shadow-card rounded-tau-sm pointer-events-none z-[300] max-w-[320px] min-w-0 px-2.5 py-[5px] text-[12px] leading-[1.55]"
        }
      >
        {card ?? (
          <>
            {tip?.hit.label}
            <span className="opacity-60"> · {tip?.hit.pluginName}</span>
          </>
        )}
      </AnchoredPanel>
      {choosing && (
        <Popover
          anchor={choosing.anchor}
          open
          placement="bottom-start"
          arrow={false}
          onOpenChange={open => !open && close()}
          className="w-[320px] max-w-[min(320px,calc(100vw-16px))] p-[5px]"
        >
          <div
            role="listbox"
            data-autofocus
            tabIndex={-1}
            aria-activedescendant={`tau-decoration-option-${index}`}
            className="outline-none"
            onKeyDown={onKeyDown}
          >
            <div className="text-ink-3 px-2 pt-1 pb-1.5 text-[11.5px]">
              有 {choosing.candidates.length} 个匹配内容
            </div>
            {choosing.candidates.map((candidate, i) => (
              <div
                key={candidate.key}
                id={`tau-decoration-option-${i}`}
                role="option"
                aria-selected={i === index}
                onPointerEnter={event => {
                  setIndex(i);
                  show(choosing.hit, event.currentTarget, candidate.key);
                }}
                onPointerLeave={leave}
                onClick={() => choose.current(choosing, candidate)}
                className={cn(
                  "rounded-tau-sm cursor-pointer px-2.5 py-1.5",
                  i === index && "bg-hover"
                )}
              >
                <div className="text-tau-body text-ink-1 truncate">{candidate.title}</div>
                {candidate.description && (
                  <div className="text-ink-3 truncate text-[11.5px]">{candidate.description}</div>
                )}
              </div>
            ))}
          </div>
          {tip?.choice !== undefined && card && (
            <div onPointerEnter={keep} onPointerLeave={leave}>
              {card}
            </div>
          )}
        </Popover>
      )}
    </>
  );
}
