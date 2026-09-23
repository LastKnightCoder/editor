import { useState } from "react";
import { Checkbox } from "@tau/ui";
import { ApiCard, DemoButton, DocHead, MatrixRow } from "../kit";

const TASKS = ["梳理组件取舍", "拦截链路测试", "样板间档案"];

const PREFERENCES = [
  { value: "review", label: "发送前人工复核" },
  { value: "telemetry", label: "匿名使用统计" },
  { value: "beta", label: "加入 Beta 通道" },
];

export default function CheckboxSection() {
  const [done, setDone] = useState([true, false, false]);
  const [prefs, setPrefs] = useState<string[]>(["review"]);

  const allDone = done.every(Boolean);
  const someDone = done.some(Boolean);
  const togglePref = (value: string) =>
    setPrefs(cur => (cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]));

  return (
    <>
      <DocHead
        title="Checkbox"
        en="checkbox"
        src="packages/ui"
        duty="勾选基础件（Input 方案 A「经典描边」语言）：原生 input[type=checkbox] 承载语义 + 自绘形制，命中 24×24，focus-visible 显 ring，选中 accent 实底 + 勾 110ms 淡入。"
      />
      <MatrixRow
        name="状态矩阵"
        desc="选中 accent 实底 + 勾 110ms 淡入；半选走 DOM 属性；错误态正源 aria-invalid（未选中 danger、选中保持 accent）；禁用降透明；无 label 时是裸勾选框"
      >
        <Checkbox label="默认" />
        <Checkbox label="选中" defaultChecked />
        <Checkbox label="半选" indeterminate />
        <Checkbox label="禁用 · 选中" disabled defaultChecked />
        <Checkbox label="禁用 · 未选" disabled />
        <Checkbox label="必选项" aria-invalid />
        <Checkbox aria-label="裸勾选框（无可见标签）" />
      </MatrixRow>
      <MatrixRow
        name="场景 · 任务清单"
        desc="行内勾选；半选由调用方联动（部分勾选 → indeterminate），点击全选项在「全选 / 清空」间切换"
      >
        <div className="flex w-[340px] flex-col gap-1">
          <div className="border-line-1 flex items-center gap-2 border-b pb-2">
            <Checkbox
              label={
                allDone
                  ? "取消全选"
                  : someDone
                    ? `已选 ${done.filter(Boolean).length} / ${done.length}`
                    : "选择全部"
              }
              checked={allDone}
              indeterminate={someDone && !allDone}
              onChange={() => setDone(done.map(() => !allDone))}
            />
          </div>
          {TASKS.map((name, i) => (
            <Checkbox
              key={name}
              label={name}
              checked={done[i]}
              onChange={() => setDone(done.map((v, j) => (j === i ? !v : v)))}
            />
          ))}
        </div>
      </MatrixRow>
      <MatrixRow
        name="受控 · 偏好多选"
        desc="checked + onChange 成对受控（真相在调用方）；「清空全部」演示外部改值"
      >
        <div className="flex w-[340px] flex-col gap-2.5">
          {PREFERENCES.map(pref => (
            <Checkbox
              key={pref.value}
              label={pref.label}
              checked={prefs.includes(pref.value)}
              onChange={() => togglePref(pref.value)}
            />
          ))}
          <div className="text-tau-meta text-ink-3">
            已选：{prefs.length ? prefs.join(" · ") : "无"}
          </div>
          <div>
            <DemoButton onClick={() => setPrefs([])}>清空全部</DemoButton>
          </div>
        </div>
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
                <b>Checkbox</b>
              </td>
              <td>
                原生 <code>input[type=checkbox]</code> 透传（
                <code>checked / onChange / disabled</code>）；
                <code>label</code> 可选渲染关联文字；<code>indeterminate</code>{" "}
                半选视觉态（联动逻辑归调用方）； 错误态正源 <code>aria-invalid</code>；命中
                24×24、focus-visible 才显 ring、无动效 prop
              </td>
            </tr>
            <tr>
              <td>
                <b>受控与半选</b>
              </td>
              <td>
                <code>checked + onChange</code> 成对出现即受控，省略则走非受控
                <code>defaultChecked</code>；<code>indeterminate</code> 无对应 attribute，组件经 DOM
                属性设置并在 checked 变化后重设——「部分选中 → 半选」的判定归调用方
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
