/**
 * FilterPill 档案 —— 本体即 ui/primitives/FilterPill。
 */

import { useState } from "react";
import { Layers } from "lucide-react";
import { FilterPill } from "@tau/ui";
import { DocHead, MatrixRow } from "../kit";

const SOURCES = [
  { value: "all", label: "全部", count: 42 },
  { value: "local", label: "本地", count: 30 },
  { value: "remote", label: "远程", count: 12 },
];

export default function FilterPillSection() {
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [raised, setRaised] = useState("all");
  const [deck, setDeck] = useState("today");
  return (
    <>
      <DocHead
        title="FilterPill"
        en="primitives/FilterPill.tsx"
        duty="页面工具栏里的单选筛选项（分类 / 来源 / 状态 / 卡组），可带图标与计数；选中 = selected 底 + accent 字。未选两种皮肤：outline（line-1 描边，微信读书分类与笔记过滤、PDF 来源）/ raised（surface 底 + 卡片投影，闪卡复习卡组、Skill 筛选）。className 经 cn 合并，可覆盖未选中的文字色。"
        src="packages/ui/src/primitives/FilterPill.tsx"
      />
      <MatrixRow
        name="outline · 带计数"
        desc="默认皮肤；计数用 tabular-nums，选中时降为 75% 不透明"
      >
        {SOURCES.map(s => (
          <FilterPill
            key={s.value}
            active={source === s.value}
            onClick={() => setSource(s.value)}
            label={s.label}
            count={s.count}
          />
        ))}
      </MatrixRow>
      <MatrixRow name="outline · 无计数" desc="count 不传即不渲染">
        {["all", "thoughts", "marked"].map((value, i) => (
          <FilterPill
            key={value}
            active={status === value}
            onClick={() => setStatus(value)}
            label={["全部", "有想法", "马克笔"][i]}
          />
        ))}
      </MatrixRow>
      <MatrixRow
        name="raised · 警示色"
        desc="variant=raised；未选中时经 className 覆盖文字色（Skill「需要处理」）"
      >
        {[
          ["all", "全部", 18],
          ["enabled", "已启用", 12],
          ["issues", "需要处理", 2],
        ].map(([value, label, count]) => (
          <FilterPill
            key={value}
            variant="raised"
            active={raised === value}
            onClick={() => setRaised(value as string)}
            label={label as string}
            count={count as number}
            className={value === "issues" && raised !== value ? "text-warn" : undefined}
          />
        ))}
      </MatrixRow>
      <MatrixRow name="raised · 图标" desc="icon 槽在标签前（闪卡卡组标记）；计数为 0 时调用方不传">
        {[
          ["today", "今日总览", 23],
          ["cs", "计算机", 0],
          ["en", "英语", 9],
        ].map(([value, label, count]) => (
          <FilterPill
            key={value}
            variant="raised"
            active={deck === value}
            onClick={() => setDeck(value as string)}
            label={label as string}
            count={(count as number) || undefined}
            icon={
              value === "today" ? undefined : <Layers className="-ml-1 size-3" strokeWidth={1.75} />
            }
          />
        ))}
      </MatrixRow>
    </>
  );
}
