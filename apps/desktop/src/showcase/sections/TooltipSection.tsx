/**
 * Tooltip 档案 —— 本体即 ui/primitives/Tooltip（自研 mini 定位引擎，D-004）。
 * 常显标本走组件的受控模式（open 常开），位置/flip/箭头全部由真引擎实时计算
 * ——滚动本页即可看到 12 个 tip 同步跟随。
 * 锚点一律用**真实控件**（IconButton / DemoButton），不用示意圆点：tooltip 的真实
 * 宿主就是按钮，用圆点既看不出锚点尺寸对 flip/shift 的影响，也示范不了真实接线。
 */

import { Info } from "lucide-react";
import { IconButton } from "@/ui/primitives/IconButton";
import { Tooltip, type TooltipPlacement } from "@/ui/primitives/Tooltip";
import { BlockTitle, CanvasCard, DemoButton, DocHead, MatrixRow, Note } from "../kit";

const SIDES = ["top", "bottom", "left", "right"] as const;
const ALIGNS = ["start", "center", "end"] as const;

/** 反相墨底上的键帽样式（ink-inverse 的 alpha 派生，语义类表达） */
const KBD_CLS = "bg-ink-inverse/20 font-tau-mono rounded-[5px] px-[5px] text-[10.5px]";

/** 单格：真实按钮锚点 + 受控常显 tip（placement 交引擎计算，箭头自动跟随边向） */
function TipCell({ placement }: { placement: TooltipPlacement }) {
  return (
    <div className="grid h-24 w-[122px] place-items-center">
      <Tooltip content={placement} open placement={placement}>
        <IconButton title={`查看 ${placement} 定位`} aria-label={`查看 ${placement} 定位`}>
          <Info size={17} strokeWidth={1.75} />
        </IconButton>
      </Tooltip>
    </div>
  );
}

export default function TooltipSection() {
  return (
    <>
      <DocHead
        title="Tooltip"
        en="primitives/Tooltip.tsx"
        duty="Portal + 自研 mini 定位引擎（offset→flip→shift→arrow，D-004）。反相墨底配色（bg-ink-1 / text-ink-inverse，深浅主题各自反相）；hover intent 450ms，400ms 内重开免延迟。"
        src="src/ui/primitives/Tooltip.tsx · tooltipPosition.ts"
      />

      <CanvasCard
        cap="LIVE"
        note="真实交互（450ms intent · 相邻触发器 400ms 内重开免延迟）"
        stageClassName="flex min-h-[110px] flex-wrap items-center gap-6"
      >
        <Tooltip content="top · 默认位 · 450ms 意图延迟" placement="top">
          <DemoButton>悬停我（top 默认位）</DemoButton>
        </Tooltip>
        <Tooltip
          content={
            <>
              复制 <kbd className={KBD_CLS}>Ctrl</kbd> + <kbd className={KBD_CLS}>C</kbd>
            </>
          }
          placement="bottom"
        >
          <DemoButton>复制</DemoButton>
        </Tooltip>
      </CanvasCard>

      <BlockTitle en="12 Placement · 受控常显，引擎实时定位">位置矩阵</BlockTitle>
      {SIDES.map(side => (
        <MatrixRow
          key={side}
          name={`side = ${side}`}
          desc={
            side === "bottom"
              ? "主轴放不下时 flip 翻对侧"
              : side === "left" || side === "right"
                ? "尖端单角圆角，描边随边向换侧"
                : "top-start / top / top-end"
          }
          trayClassName=""
        >
          {ALIGNS.map(align => (
            <TipCell key={align} placement={`${side}-${align}` as TooltipPlacement} />
          ))}
        </MatrixRow>
      ))}

      <BlockTitle en="Content">内容形态</BlockTitle>
      <MatrixRow name="长文本" desc="280px 处自动换行">
        <Tooltip
          open
          content="对卡片内容做三层加工：逐层压缩摘要，保留可回溯的原文链接；本条演示长文本在 280px 处自动换行的排版效果。"
        >
          <DemoButton>悬停查看说明</DemoButton>
        </Tooltip>
      </MatrixRow>
      <MatrixRow
        name="disabled 触发器"
        desc="自动包 wrapper 接管 pointer 事件（Chromium 吞事件）——悬停禁用按钮也有 tip"
      >
        <Tooltip open content="禁用原因说明（受控常显标本）">
          <DemoButton disabled className="opacity-50">
            禁用按钮
          </DemoButton>
        </Tooltip>
      </MatrixRow>

      <Note>
        不承载可交互内容——可点的说明浮层是未来 Popover/Menu 的职责；<em>open / onOpenChange</em>{" "}
        受控模式对齐 §5.3 浮层契约（统计页趋势图动态锚即此用法）。滚动本页，12 个常显 tip 由
        scroll(capture) 监听同步重算——引擎行为可见。位移中间件的闸门是「锚点与视口相交」：
        锚点滚出视口后 tip <em>不再夹回视口</em>，随锚点一起离屏，否则整页常显 tip 会全被
        钉在视口边缘堆成一片。
      </Note>
    </>
  );
}
