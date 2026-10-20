import { useEffect, useRef, useState, type PointerEvent } from "react";
import { EyeOff, Info, Square, Undo2 } from "lucide-react";
import { Button, cn } from "@tau/ui";
import { annotationColors, drawAnnotations, rectFromDrag, type Annotation } from "./image";
import type { Screenshot } from "./useFeedbackDraft";

const TOOLS = [
  { kind: "box", label: "框选", icon: Square },
  { kind: "mask", label: "打码", icon: EyeOff },
] as const;

/**
 * 标注画布：在原图上拖出框选/打码矩形，撤销逐个回退。
 * 画布按容器尺寸等比缩放显示，标注存归一化坐标，导出时再按输出尺寸重画。
 */
export function AnnotateView({
  shot,
  onDone,
  onCancel,
}: {
  shot: Screenshot;
  onDone: (annotations: Annotation[]) => void;
  onCancel: () => void;
}) {
  const [tool, setTool] = useState<Annotation["kind"]>("box");
  const [annotations, setAnnotations] = useState<Annotation[]>(shot.annotations);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const fit = () => {
      const scale = Math.min(
        element.clientWidth / shot.source.width,
        element.clientHeight / shot.source.height
      );
      setSize({
        width: Math.floor(shot.source.width * scale),
        height: Math.floor(shot.source.height * scale),
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shot.source]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || !size.width) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = size.width * ratio;
    element.height = size.height * ratio;
    context.drawImage(shot.source, 0, 0, element.width, element.height);
    drawAnnotations(
      context,
      draft ? [...annotations, draft] : annotations,
      element.width,
      element.height,
      annotationColors()
    );
  }, [shot.source, annotations, draft, size]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4">
      <div className="flex items-center gap-2">
        <div className="bg-hover flex items-center gap-0.5 rounded-[9px] p-[3px]">
          {TOOLS.map(item => (
            <button
              key={item.kind}
              type="button"
              aria-pressed={tool === item.kind}
              onClick={() => setTool(item.kind)}
              className={cn(
                "text-tau-sm flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 transition-colors",
                tool === item.kind
                  ? "bg-surface text-ink-1 shadow-card"
                  : "text-ink-2 hover:text-ink-1"
              )}
            >
              <item.icon size={14} strokeWidth={1.75} />
              {item.label}
            </button>
          ))}
          <span className="bg-line-1 mx-1 h-4 w-px" />
          <button
            type="button"
            disabled={!annotations.length}
            onClick={() => setAnnotations(current => current.slice(0, -1))}
            className="text-tau-sm text-ink-2 hover:text-ink-1 flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 transition-colors disabled:opacity-40"
          >
            <Undo2 size={14} strokeWidth={1.75} />
            撤销
          </button>
        </div>
        <span className="text-tau-micro text-ink-3 ml-auto">在截图上拖动画出区域</span>
      </div>
      <div ref={frame} className="grid min-h-0 flex-1 place-items-center">
        <canvas
          ref={canvas}
          aria-label="标注画布"
          style={{ width: size.width, height: size.height }}
          className="border-line-1 cursor-crosshair touch-none rounded-[8px] border"
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId);
            start.current = point(event);
          }}
          onPointerMove={event => {
            if (start.current) setDraft(rectFromDrag(tool, start.current, point(event), 0));
          }}
          onPointerUp={event => {
            const rect = start.current && rectFromDrag(tool, start.current, point(event));
            start.current = null;
            setDraft(null);
            if (rect) setAnnotations(current => [...current, rect]);
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-tau-micro text-ink-3 mr-auto flex items-center gap-1.5">
          <Info size={13} />
          打码在本机直接涂实，发送的是处理后的图片，原图不上传
        </span>
        <Button onClick={onCancel}>取消</Button>
        <Button variant="primary" onClick={() => onDone(annotations)}>
          完成
        </Button>
      </div>
    </div>
  );
}
