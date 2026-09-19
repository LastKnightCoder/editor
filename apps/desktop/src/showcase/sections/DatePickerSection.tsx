import { useState } from "react";
import { DatePicker, DateRangePicker } from "@tau/ui";
import { ApiCard, DocHead, MatrixRow } from "../kit";

const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shiftDay = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 快捷预设（数据驱动：取值函数打开时求值，动态日期保持新鲜） */
const RANGE_PRESETS = [
  {
    label: "本周",
    range: () => {
      const d = new Date();
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      const key = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
      return [key(monday), key(sunday)] as const; // 完整自然周（周一 ~ 周日）
    },
  },
  { label: "最近 7 天", range: () => [shiftDay(-6), todayKey()] as const },
  { label: "最近 30 天", range: () => [shiftDay(-29), todayKey()] as const },
];

export default function DatePickerSection() {
  const [due, setDue] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [range, setRange] = useState<[string, string] | null>(null);
  return (
    <>
      <DocHead
        title="DatePicker"
        en="date-picker"
        src="packages/ui"
        duty="经典月历单日期（即点即定 + 钻取导航）与范围形态（预设列 + 双月 + 底栏确认），共享日历引擎与弹层契约。"
      />
      <MatrixRow
        name="单日期 · day"
        desc="点日期即提交并关闭；点标题钻取月 / 年代视图；T 今天、PgUp/PgDn 翻月"
      >
        <DatePicker value={due} onValueChange={setDue} placeholder="选择日期" clearable />
        <DatePicker defaultValue="2026-10-01" />
        <DatePicker placeholder="sm 尺寸" size="sm" />
        <DatePicker placeholder="禁用" disabled />
      </MatrixRow>
      <MatrixRow
        name="单日期 · minute"
        desc="点日期只挂起，时刻框自由键入任意分钟（9:5 → 09:05），确定提交"
      >
        <DatePicker
          precision="minute"
          value={dueAt}
          onValueChange={setDueAt}
          placeholder="日期与时刻"
        />
      </MatrixRow>
      <MatrixRow
        name="预设行"
        desc="日历下方一行，内容由使用方传入（数据驱动），即点即定、命中回显"
      >
        <DatePicker
          precision="minute"
          presets={[
            { label: "今天 · 下午六点", value: () => `${todayKey()} 18:00` },
            { label: "明天 · 上午九点", value: () => `${shiftDay(1)} 09:00` },
          ]}
          placeholder="试试点预设"
        />
      </MatrixRow>
      <MatrixRow name="范围" desc="手选走「起点 → 悬停预览 → 终点 → 确定」三道闸；预设即选即定">
        <DateRangePicker value={range} onValueChange={setRange} presets={RANGE_PRESETS} />
      </MatrixRow>
      <ApiCard title="API 备忘">
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
                <code>value / defaultValue / onValueChange</code>
              </td>
              <td>
                受控契约（§5.3）。值一律 string：<code>{"string | null"}</code>（DatePicker， 格式{" "}
                <code>"YYYY-MM-DD"</code>，precision="minute" 时 <code>"YYYY-MM-DD HH:mm"</code>）；
                <code>{"readonly [string, string] | null"}</code>（DateRangePicker，升序对）
              </td>
            </tr>
            <tr>
              <td>
                <code>precision</code>
              </td>
              <td>
                <code>{'"day" | "minute"'}</code>（DatePicker）——值格式与提交模型随之切换： day
                点日期即提交；minute 点日期只挂起，底栏时刻区 +「确定」显式提交
              </td>
            </tr>
            <tr>
              <td>
                <code>presets</code>
              </td>
              <td>
                预设（数据驱动、内容使用方决定、即点即定）：DatePicker 为
                <code>{"{ label, value: () => string | null }[]"}</code>（日历下方一行）；
                DateRangePicker 为{" "}
                <code>{"{ label, range: () => [string, string] | null }[]"}</code>（面板左列）
              </td>
            </tr>
            <tr>
              <td>
                <code>timeStep</code>
              </td>
              <td>时刻网格步长（分钟，默认 15）；时刻框始终可自由键入任意分钟，网格是快捷通道</td>
            </tr>
            <tr>
              <td>
                <code>isDateDisabled</code>
              </td>
              <td>
                <code>{"(day: string) => boolean"}</code>——入参 "YYYY-MM-DD"，业务侧零 Date 依赖
              </td>
            </tr>
            <tr>
              <td>
                <code>clearable · size · status · disabled</code>
              </td>
              <td>
                触发器 hover 清除 ×（值回 null）· <code>{"sm | md"}</code> · Field 体系错误描边 ·
                整体禁用
              </td>
            </tr>
            <tr>
              <td>
                <code>open / onOpenChange</code>
              </td>
              <td>浮层受控（§5.3 契约；常显标本用它）</td>
            </tr>
            <tr>
              <td>
                <b>键盘</b>
              </td>
              <td>
                ↑↓←→ 网格导航 · PgUp/PgDn 翻月 · T 今天 · Enter 提交（day）/ 挂起（minute，时刻框
                Enter 确定）· Esc 逐层退场（时刻网格 → 面板），焦点归还触发器
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
