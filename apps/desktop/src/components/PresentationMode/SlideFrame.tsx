/**
 * 舞台画面：给定逻辑尺寸的整幅画布，正文按编辑器常规字号排版，放大由调用方整体缩放。
 * 画面自行测量块高、生成镜头计划并按 step 移动内容轨道；放映与缩略图共用同一份渲染。
 */
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { Editor, type EditorRef } from "@tau/editor";
import { cn } from "@tau/ui";
import { getContentKit } from "@/services/editorKit";
import {
  SINGLE_SCREEN,
  hasMoreBelow,
  planCamera,
  type BlockBox,
  type CameraPlan,
} from "./cameraPlan";
import { STAGE_CONTENT_WIDTH, STAGE_PAD_TOP, cameraViewport } from "./frame";
import { isHeader } from "./sections";

const FADE = 64;

function sameBlocks(a: BlockBox[] | null, b: BlockBox[]) {
  return (
    !!a &&
    a.length === b.length &&
    a.every(
      (box, i) =>
        Math.abs(box.top - b[i].top) < 1 &&
        Math.abs(box.height - b[i].height) < 1 &&
        box.heading === b[i].heading
    )
  );
}

/** 上下渐隐提示视口外还有内容（mask 只取 alpha） */
function fadeMask(top: boolean, bottom: boolean): CSSProperties | undefined {
  if (!top && !bottom) return undefined;
  const head = top ? `transparent 0, black ${FADE}px` : "black 0";
  const tail = bottom ? `black calc(100% - ${FADE}px), transparent 100%` : "black 100%";
  const image = `linear-gradient(to bottom, ${head}, ${tail})`;
  return { maskImage: image, WebkitMaskImage: image };
}

interface SlideFrameProps {
  section: Descendant[];
  /** 逻辑尺寸 */
  width: number;
  height: number;
  step?: number;
  onPlan?: (plan: CameraPlan) => void;
  /** 右下角页码；不传不显示 */
  pageNumber?: number;
  /** 缩略图：不可交互、不显示屏指示 */
  thumbnail?: boolean;
}

export const SlideFrame = memo(function SlideFrame({
  section,
  width,
  height,
  step = 0,
  onPlan,
  pageNumber,
  thumbnail = false,
}: SlideFrameProps) {
  const editorRef = useRef<EditorRef>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<BlockBox[] | null>(null);
  // 首个计划落位后再开过渡，避免进场时从默认位置滑过来
  const [animated, setAnimated] = useState(false);
  const onPlanRef = useRef(onPlan);
  onPlanRef.current = onPlan;
  const viewport = cameraViewport(height);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const measure = () => {
      const trackRect = track.getBoundingClientRect();
      // 祖先缩放与自身 fit 都体现在 rect 上，除回逻辑像素
      const ratio = track.offsetHeight > 0 ? trackRect.height / track.offsetHeight : 1;
      if (!ratio) return;
      const slate = editorRef.current?.getEditor();
      let next: BlockBox[] = [];
      if (slate) {
        next = slate.children.flatMap(node => {
          try {
            const rect = ReactEditor.toDOMNode(slate, node).getBoundingClientRect();
            const top = (rect.top - trackRect.top) / ratio;
            return [{ top, height: rect.height / ratio, heading: isHeader(node) }];
          } catch {
            return [];
          }
        });
      }
      if (next.length === 0) next = [{ top: 0, height: track.offsetHeight, heading: false }];
      setBlocks(prev => (sameBlocks(prev, next) ? prev : next));
    };
    measure();
    // 图片、图表等异步撑高后重排计划
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(track);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const plan = useMemo(() => (blocks ? planCamera(blocks, viewport) : null), [blocks, viewport]);

  useEffect(() => {
    if (plan) onPlanRef.current?.(plan);
  }, [plan]);

  useEffect(() => {
    if (!plan || animated || thumbnail) return;
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, [plan, animated, thumbnail]);

  const active = plan ?? SINGLE_SCREEN;
  const current = Math.min(step, active.steps.length - 1);
  const multi = active.steps.length > 1;
  const more = hasMoreBelow(active, current, viewport);
  const transform = active.centered
    ? `translateY(${(viewport - active.total * active.fit) / 2}px) scale(${active.fit})`
    : `translateY(${-active.steps[current]}px)`;

  return (
    <div
      className={cn(
        "bg-surface text-ink-1 text-(length:--font-size) relative overflow-hidden",
        thumbnail && "pointer-events-none select-none"
      )}
      style={{ width, height }}
    >
      <div className="absolute inset-0" style={fadeMask(!active.centered && current > 0, more)}>
        <div
          ref={trackRef}
          className={cn(
            "absolute origin-top",
            !plan && "invisible",
            animated && "ease-tau-out transition-transform duration-[420ms]"
          )}
          style={{
            left: (width - STAGE_CONTENT_WIDTH) / 2,
            top: STAGE_PAD_TOP,
            width: STAGE_CONTENT_WIDTH,
            transform,
          }}
        >
          <Editor kit={getContentKit()} ref={editorRef} readonly initValue={section} />
        </div>
      </div>

      {!thumbnail && multi && (
        <div className="absolute right-6 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
          {active.steps.map((offset, i) => (
            <span
              key={offset}
              className={cn(
                "ease-tau-out w-1 rounded-full transition-all duration-[240ms]",
                i === current ? "bg-accent h-[22px]" : "bg-line-1 h-3"
              )}
            />
          ))}
        </div>
      )}
      {pageNumber !== undefined && (
        <span className="text-tau-micro text-ink-3 absolute bottom-4 right-6 tabular-nums">
          {pageNumber}
        </span>
      )}
    </div>
  );
});
