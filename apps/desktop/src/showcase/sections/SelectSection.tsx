/**
 * Select 档案 —— 数据驱动单选。全部标本可交互（点击/键盘实测行为），
 * 不设恒开常显标本（弹层会遮挡相邻标本、阻断交互）。
 */

import { useState } from "react";
import { Select, type SelectOption } from "@/ui/primitives/Select";
import { ApiCard, BlockTitle, CanvasCard, DocHead, MatrixRow, Note } from "../kit";

const VIEWS: SelectOption<string>[] = [
  { value: "today", label: "今日" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "year", label: "本年" },
];

const NOTEBOOKS: SelectOption<string>[] = [
  { value: "inbox", label: "收件箱", group: "置顶" },
  { value: "ideas", label: "灵感速记", group: "置顶" },
  { value: "work", label: "工作 · 重构", group: "全部笔记本" },
  { value: "read", label: "阅读摘录", group: "全部笔记本" },
  { value: "arch", label: "归档（只读）", group: "全部笔记本", disabled: true },
];

const RICH: SelectOption<string>[] = [
  {
    value: "zh",
    label: "中文（简体）",
    searchText: "中文 简体 chinese zh",
  },
  {
    value: "en",
    label: "English",
    searchText: "english 英文 en",
  },
  {
    value: "ja",
    label: "日本語",
    searchText: "日本語 日文 japanese ja",
  },
];

export default function SelectSection() {
  const [view, setView] = useState("week");
  const [nb, setNb] = useState<string | null>(null);
  const [lang, setLang] = useState("zh");

  return (
    <>
      <DocHead
        title="Select"
        en="primitives/Select.tsx"
        duty="数据驱动单选。options 即选项集合：搜索是一行 filter、分组是 group 字段、异步是换数组；键盘全表与 aria 内建，定位复用 D-004 引擎（gap 4，下方放不下翻上）。"
        src="src/ui/primitives/Select.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="键盘全表可用：↑↓ / Enter / Esc / Home·End / 敲字跳匹配"
        stageClassName="flex min-h-[300px] flex-col items-start justify-center gap-6"
      >
        <div className="flex flex-wrap items-center gap-4">
          <Select options={VIEWS} value={view} onValueChange={setView} placeholder="选择视图" />
          <Select
            options={NOTEBOOKS}
            value={nb}
            onValueChange={setNb}
            placeholder="选择笔记本…"
            searchable
          />
          <Select options={RICH} value={lang} onValueChange={setLang} searchable />
        </div>
        <div className="text-tau-meta text-ink-3 font-tau-mono">
          view = {view} · notebook = {nb ?? "null"} · lang = {lang}
        </div>
      </CanvasCard>

      <BlockTitle en="状态标本（全部可交互）">状态矩阵</BlockTitle>
      <MatrixRow
        name="分组 · 两态并存"
        desc="点击展开：分组标签 + 选中 bg-selected + Check + 高亮 bg-hover"
      >
        <Select options={NOTEBOOKS} defaultValue="inbox" className="min-w-[232px]" />
      </MatrixRow>
      <MatrixRow name="size=sm · 28px" desc="工具栏 / FilterBar 尺寸">
        <Select options={VIEWS} defaultValue="week" size="sm" />
      </MatrixRow>
      <MatrixRow name="disabled" desc="整组禁用（opacity 55，不可聚焦）">
        <Select options={VIEWS} defaultValue="today" disabled />
      </MatrixRow>
      <MatrixRow name="status=error" desc="Field 体系错误态（danger 描边）">
        <Select options={VIEWS} defaultValue="today" status="error" />
      </MatrixRow>
      <MatrixRow
        name="空态 · emptyText"
        desc="点开即见（空 options；过滤无命中同款文案，空搜索词不过滤是组件语义）"
      >
        <Select options={[]} searchable className="min-w-[232px]" />
      </MatrixRow>

      <ApiCard title="API 备忘（声明式）">
        <table>
          <thead>
            <tr>
              <th>Prop</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>options</code>
              </td>
              <td>
                <code>{"SelectOption<V>[]"}</code>：value / label(ReactNode) / disabled / group /
                searchText（富 label 的搜索代理）
              </td>
            </tr>
            <tr>
              <td>
                <code>value · defaultValue · onValueChange</code>
              </td>
              <td>受控 / 非受控（§5.3 契约）；字段名与 antd 对齐，存量 options 用法直映</td>
            </tr>
            <tr>
              <td>
                <code>searchable · filter · emptyText</code>
              </td>
              <td>弹层内嵌搜索框（自动聚焦）；默认 label+searchText 的 includes</td>
            </tr>
            <tr>
              <td>
                <code>size · status · disabled · placeholder</code>
              </td>
              <td>
                sm=28px / md=34px；<code>status="error"</code> 给 Field 体系
              </td>
            </tr>
            <tr>
              <td>
                <code>open · onOpenChange</code>
              </td>
              <td>浮层受控（对齐 §5.3 契约）；matchTriggerWidth 默认开</td>
            </tr>
          </tbody>
        </table>
      </ApiCard>

      <Note>
        表单控件家族口径（2026-09-17 裁决 sunken→group→surface）：触发器与搜索框 =
        <em> surface 亮底 + line-1 描边</em>，「浮起物」语感。层级 <em>z-[250]</em>
        （命令面板 101 &lt; Toast 200 &lt; Select/Menu 250 &lt; Tooltip 300）；Esc 仅 open 态在组件
        DOM 上消费——焦点链即 LIFO，不进 D-003 全局注册表。M0 明确不做：多选 （M1{" "}
        <code>value: V[]</code>）、异步 loading prop、虚拟化、renderOption。
      </Note>
    </>
  );
}
