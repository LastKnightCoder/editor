/**
 * YearHeatmap 档案 —— 本体即 ui/primitives/YearHeatmap。
 * 数据为确定性伪随机（seed 固定），仅作视觉演示，非真实统计。
 */

import { useMemo } from "react";
import { YearHeatmap, type YearHeatmapDay } from "@tau/ui";
import { CanvasCard, DocHead, Note } from "../kit";

function demoDays(): YearHeatmapDay[] {
  // 线性同余伪随机（固定 seed，刷新稳定）：今年 1/1 → 今天
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const days: YearHeatmapDay[] = [];
  const end = new Date();
  for (const d = new Date(end.getFullYear(), 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date, count: Math.floor(rnd() * 26) });
  }
  return days;
}

export default function HeatmapSection() {
  const days = useMemo(demoDays, []);
  return (
    <>
      <DocHead
        title="YearHeatmap"
        en="primitives/YearHeatmap.tsx"
        duty="全年活动热力图（圆点）：home/stats 两域共用自绘图表。圆点、色阶随 scale 递增、周列贴底对齐、hover 呼吸、全宽自适应；输入为 {date, count}[] 纯数据，零业务依赖。"
        src="packages/ui/src/primitives/YearHeatmap.tsx"
      />

      <CanvasCard cap="LIVE" note="确定性演示数据 · hover 呼吸" stageClassName="block">
        <YearHeatmap days={days} caption="演示数据（确定性伪随机）" />
      </CanvasCard>

      <Note>
        色阶为固定暖橙（<em>rgba(217,119,87,α)</em> 硬编码派生），不随主题换肤——切到深色主题后
        仍是同一组橙。
      </Note>
    </>
  );
}
