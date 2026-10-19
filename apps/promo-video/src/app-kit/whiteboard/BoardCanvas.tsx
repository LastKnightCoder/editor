/**
 * 白板画布：画框、形状、箭头、思维导图、文章卡。普通画风照 packages/whiteboard 的默认渲染，
 * 手绘画风直接调用软件的 sketchShape / sketchArrow（种子取元素 id 的哈希，笔触与软件一致）；
 * 切换画风同软件一样是一帧内整体替换。view 决定板坐标中哪一点对准容器中心、缩放多少。
 */
import type { CSSProperties } from "react";
import clsx from "clsx";
import { useCurrentFrame } from "remotion";
import { ease, progress } from "../../brand/motion";
import { DocCard } from "../parts/ComposeBoard";
import { BOARD_ARROWS, BOARD_DOC, BOARD_FRAME, BOARD_LINK, BOARD_REF, BOARD_SHAPES, MIND_FONT, MIND_NODES, type BoardArrow, type BoardShape, type MindNode } from "../../mock/board";
import { EMarkerType, hashSeed, MindThemeUtil, sketchArrow, sketchShape, type SketchPath } from "./sketch";

export type BoardView = { x: number; y: number; zoom: number };

export type BoardReveal = {
  /** 各形状画出 0→1 */
  shapes: number[];
  /** 画框内两条箭头 */
  arrows: number;
  /** 画框 → 导图的强调箭头 */
  link: number;
  /** 导图各节点出现 0→1（与 MIND_NODES 同序） */
  mind: number[];
  /** 叶子到文章卡的虚线引用 */
  ref: number;
};

export type BoardLook = { sketch: boolean; palette: string };

/** 手绘「自然」档；导图文字随档位换手绘字体（handTextClass） */
const LEVEL = "natural" as const;
const HAND_TEXT = "font-tau-hand [font-variation-settings:'wght'_480,'INFM'_40]";
const FRAME_STYLE = { background: "rgba(59, 130, 246, 0.1)", border: "#3b82f6" };

function Paths({ paths }: { paths: SketchPath[] }) {
  return (
    <>
      {paths.map((path, i) => (
        <g key={i}>
          {path.clip && (
            <clipPath id={`clip-${hashSeed(path.clip)}-${i}`}>
              <path d={path.clip} />
            </clipPath>
          )}
          <path
            d={path.d}
            style={{ fill: path.color }}
            opacity={path.role === "lines" ? (path.opacity ?? 1) * 0.85 : path.opacity}
            clipPath={path.clip ? `url(#clip-${hashSeed(path.clip)}-${i})` : undefined}
          />
        </g>
      ))}
    </>
  );
}

const diamondPath = (w: number, h: number) => `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;

function outlineD(shape: BoardShape) {
  const { width: w, height: h } = shape;
  if (shape.kind === "rect") return `M 6 0 H ${w - 6} Q ${w} 0 ${w} 6 V ${h - 6} Q ${w} ${h} ${w - 6} ${h} H 6 Q 0 ${h} 0 ${h - 6} V 6 Q 0 0 6 0 Z`;
  if (shape.kind === "ellipse") return `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`;
  return diamondPath(w, h);
}

function ShapeView({ shape, t, sketch }: { shape: BoardShape; t: number; sketch: boolean }) {
  if (t <= 0) return null;
  const fillIn = progress(t, 0.55, 0.45);
  if (sketch) {
    const paths = sketchShape({
      outline: shape.kind === "rect" ? { kind: "rect", cornerRadius: 6 } : shape.kind === "ellipse" ? { kind: "ellipse" } : { kind: "path", paths: [diamondPath(shape.width, shape.height)] },
      width: shape.width,
      height: shape.height,
      stroke: shape.stroke,
      strokeWidth: 2,
      fill: shape.sketchFill,
      // 线类填充调淡，不压形状里的文字（同官网示意的 0.55）
      fillOpacity: shape.fillStyle === "solid" ? 1 : 0.55,
      fillStyle: shape.fillStyle,
      level: LEVEL,
      seed: hashSeed(shape.id),
    });
    return (
      <g transform={`translate(${shape.x} ${shape.y})`}>
        <Paths paths={paths} />
      </g>
    );
  }
  return (
    <g transform={`translate(${shape.x} ${shape.y})`}>
      <path d={outlineD(shape)} style={{ fill: shape.fill }} opacity={fillIn} />
      <path d={outlineD(shape)} fill="none" style={{ stroke: shape.stroke }} strokeWidth={2} pathLength={1} strokeDasharray={`${t} 1`} strokeLinejoin="round" />
    </g>
  );
}

function ArrowView({ arrow, t, sketch, dashed }: { arrow: BoardArrow; t: number; sketch: boolean; dashed?: boolean }) {
  if (t <= 0) return null;
  const [x1, y1] = arrow.from;
  const [x2, y2] = arrow.to;
  const color = arrow.accent ? "var(--tau-accent)" : dashed ? "var(--tau-ink-3)" : "var(--tau-ink-2)";
  const width = arrow.accent ? 2.2 : 1.8;
  const d = `M ${x1} ${y1} L ${x2} ${y2}`;
  if (sketch) {
    const out = sketchArrow({
      d,
      color,
      strokeWidth: width,
      dashed,
      sourceMarker: EMarkerType.None,
      targetMarker: dashed ? EMarkerType.None : EMarkerType.Arrow,
      level: LEVEL,
      seed: hashSeed(arrow.id),
    });
    return <Paths paths={out.paths} />;
  }
  // 普通画风：直线 + 实心三角箭头，从起点画出
  const ex = x1 + (x2 - x1) * t;
  const ey = y1 + (y2 - y1) * t;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 10;
  const p1 = [ex - head * Math.cos(angle - 0.42), ey - head * Math.sin(angle - 0.42)];
  const p2 = [ex - head * Math.cos(angle + 0.42), ey - head * Math.sin(angle + 0.42)];
  return (
    <g>
      <path d={`M ${x1} ${y1} L ${ex} ${ey}`} style={{ stroke: color }} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? "5 6" : undefined} fill="none" />
      {!dashed && t > 0.6 && <path d={`M ${ex} ${ey} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} Z`} style={{ fill: color }} />}
    </g>
  );
}

const visualOf = (node: MindNode, palette: string) => MindThemeUtil.getNodeVisual({ themeId: palette, themeStyle: "solid" }, node.level, node.branch, "light");

/** 父节点右缘中点 → 子节点左缘中点的 S 形曲线（ArrowUtil 的 forceVertical 画法） */
function edgeD(parent: MindNode, child: MindNode) {
  const s = [parent.x + parent.width, parent.y + parent.height / 2];
  const e = [child.x, child.y + child.height / 2];
  const mx = s[0] + (e[0] - s[0]) / 2;
  return `M ${s[0]} ${s[1]} C ${mx} ${s[1]} ${mx} ${e[1]} ${e[0]} ${e[1]}`;
}

const ROOT_SEED = hashSeed("mind-root");

function MindEdges({ reveal, look }: { reveal: number[]; look: BoardLook }) {
  return (
    <>
      {MIND_NODES.map((node, i) => {
        const parent = MIND_NODES.find(n => n.id === node.parent);
        const t = reveal[i] ?? 0;
        if (!parent || t <= 0) return null;
        const visual = visualOf(node, look.palette);
        const d = edgeD(parent, node);
        if (look.sketch) {
          const out = sketchArrow({
            d,
            color: visual.lineColor,
            strokeWidth: visual.lineWidth,
            sourceMarker: EMarkerType.None,
            targetMarker: EMarkerType.None,
            level: LEVEL,
            seed: (ROOT_SEED ^ hashSeed(node.id)) >>> 0,
          });
          return <Paths key={node.id} paths={out.paths} />;
        }
        return <path key={node.id} d={d} fill="none" stroke={visual.lineColor} strokeWidth={visual.lineWidth} strokeLinecap="round" pathLength={1} strokeDasharray={`${Math.min(1, t * 1.4)} 1`} />;
      })}
    </>
  );
}

function MindNodes({ reveal, look }: { reveal: number[]; look: BoardLook }) {
  return (
    <>
      {MIND_NODES.map((node, i) => {
        const t = reveal[i] ?? 0;
        if (t <= 0) return null;
        const visual = visualOf(node, look.palette);
        const pop = progress(t, 0, 1, ease.out);
        const style: CSSProperties = {
          left: node.x,
          top: node.y,
          width: node.width,
          height: node.height,
          opacity: Math.min(1, t * 2),
          transform: `scale(${0.6 + 0.4 * pop})`,
          transformOrigin: "left center",
        };
        return (
          <div key={node.id} className="absolute" style={style}>
            {look.sketch ? (
              <svg className="absolute top-0 left-0 overflow-visible" width={node.width} height={node.height}>
                <Paths
                  paths={sketchShape({
                    outline: { kind: "rect", cornerRadius: visual.borderRadius },
                    width: node.width,
                    height: node.height,
                    fill: visual.background || undefined,
                    washAlpha: 1,
                    stroke: visual.borderWidth > 0 ? visual.borderColor : undefined,
                    strokeWidth: Math.max(1.2, visual.borderWidth),
                    level: LEVEL,
                    seed: (ROOT_SEED ^ hashSeed(node.id)) >>> 0,
                  })}
                />
              </svg>
            ) : (
              <div
                className="absolute top-0 left-0 box-border"
                style={{ background: visual.background, border: `${visual.borderWidth}px solid ${visual.borderColor}`, borderRadius: visual.borderRadius, width: node.width, height: node.height }}
              />
            )}
            <div
              className={clsx("relative box-border w-fit rounded-[4px] p-4 whitespace-nowrap", look.sketch && HAND_TEXT)}
              style={{ color: visual.textColor, fontSize: MIND_FONT, lineHeight: 1.57, fontWeight: node.level === 1 ? 700 : 400 }}
            >
              {node.text}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function BoardCanvas({ view, width, height, reveal, look }: { view: BoardView; width: number; height: number; reveal: BoardReveal; look: BoardLook }) {
  const frame = useCurrentFrame();
  const F = BOARD_FRAME;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${width / 2}px, ${height / 2}px) scale(${view.zoom}) translate(${-view.x}px, ${-view.y}px)` }}>
        {/* 画框：底与边框，名签在框外上方 50px */}
        <div className="absolute" style={{ left: F.x, top: F.y, width: F.width, height: F.height }}>
          {look.sketch ? (
            <>
              <div className="absolute inset-0" style={{ background: FRAME_STYLE.background, borderRadius: 8 }} />
              <svg className="absolute top-0 left-0 overflow-visible" width={F.width} height={F.height}>
                <Paths
                  paths={sketchShape({ outline: { kind: "rect", cornerRadius: 8 }, width: F.width, height: F.height, stroke: FRAME_STYLE.border, strokeWidth: 2, level: LEVEL, seed: hashSeed(F.id) })}
                />
              </svg>
            </>
          ) : (
            <div className="absolute inset-0" style={{ background: FRAME_STYLE.background, border: `2px solid ${FRAME_STYLE.border}`, borderRadius: 8 }} />
          )}
          <div className="absolute left-0 flex items-center" style={{ top: -50, height: 40 }}>
            <span
              className={clsx("flex h-full w-fit min-w-5 items-center rounded-lg px-2 py-1 text-center text-sm font-medium", look.sketch && HAND_TEXT)}
              style={{ background: FRAME_STYLE.border, color: "#ffffff", textShadow: "0 1px 1px rgba(0,0,0,0.25)" }}
            >
              {F.name}
            </span>
          </div>
        </div>

        <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1}>
          {BOARD_SHAPES.map((shape, i) => (
            <ShapeView key={shape.id} shape={shape} t={reveal.shapes[i] ?? 0} sketch={look.sketch} />
          ))}
          {BOARD_ARROWS.map(arrow => (
            <ArrowView key={arrow.id} arrow={arrow} t={reveal.arrows} sketch={look.sketch} />
          ))}
          <ArrowView arrow={BOARD_LINK} t={reveal.link} sketch={look.sketch} />
          <ArrowView arrow={BOARD_REF} t={reveal.ref} sketch={look.sketch} dashed />
          <MindEdges reveal={reveal.mind} look={look} />
        </svg>

        {/* 形状上的文字（几何元素内的富文本） */}
        {BOARD_SHAPES.map((shape, i) => (
          <div
            key={shape.id}
            className={clsx("text-ink-1 absolute flex items-center justify-center text-[14.5px] font-medium", look.sketch && HAND_TEXT)}
            style={{ left: shape.x, top: shape.y, width: shape.width, height: shape.height, opacity: progress(reveal.shapes[i] ?? 0, 0.6, 0.4) }}
          >
            {shape.label}
          </div>
        ))}

        <MindNodes reveal={reveal.mind} look={look} />
        <DocCard doc={BOARD_DOC} state={{ appear: 1 }} frame={frame} />
      </div>
    </div>
  );
}
