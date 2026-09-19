import { useState } from "react";
import { Search } from "lucide-react";
import { Input, NumberInput, Textarea } from "@tau/ui";
import { ApiCard, DocHead, MatrixRow } from "../kit";

export default function InputSection() {
  const [query, setQuery] = useState("浙江省 · 杭州市");
  const [amount, setAmount] = useState<number | null>(15);
  const [note, setNote] = useState("");
  return (
    <>
      <DocHead
        title="Input"
        en="input · textarea · number"
        src="packages/ui"
        duty="文本输入基础件（方案 A「经典描边」）：surface 亮底 + line-1 描边，与 Select / DatePicker 触发器同族同皮。原生 input 透传，形制挂容器。"
      />
      <MatrixRow
        name="状态矩阵"
        desc="错误态正源是 aria-invalid（无 status prop）；只读框在、文字转次色、默认光标"
      >
        <div className="w-[210px]">
          <Input placeholder="默认" />
        </div>
        <div className="w-[210px]">
          <Input placeholder="聚焦试试（accent + ring）" />
        </div>
        <div className="w-[210px]">
          <Input defaultValue="not-an-email" aria-invalid />
        </div>
        <div className="w-[210px]">
          <Input defaultValue="只读内容" readOnly />
        </div>
        <div className="w-[210px]">
          <Input defaultValue="禁用" disabled />
        </div>
      </MatrixRow>
      <MatrixRow
        name="前后缀与清空"
        desc="lead 前缀 icon；clearable 有值时容器 hover/focus 显现 ×（清空后焦点留在输入框）"
      >
        <div className="w-[260px]">
          <Input lead={Search} placeholder="搜索笔记本…" clearable />
        </div>
        <div className="w-[260px]">
          <Input value={query} onChange={e => setQuery(e.target.value)} clearable />
        </div>
        <div className="w-[180px]">
          <Input placeholder="sm · FilterBar" size="sm" />
        </div>
      </MatrixRow>
      <MatrixRow
        name="数值 · beforeinput 事前拦截"
        desc="非数字字符与粘贴根本进不来；粘贴先清洗（试试粘 ¥1,200）；blur 归一化（5. → 5）"
      >
        <div className="w-[200px]">
          <NumberInput value={amount} onValueChange={setAmount} />
        </div>
        <div className="text-tau-meta text-ink-3 tabular-nums">value = {String(amount)}</div>
      </MatrixRow>
      <MatrixRow
        name="多行 · 计数器"
        desc="maxLength 传值即右下计数（超限转 danger，浏览器层硬限）"
      >
        <div className="w-[320px]">
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={200}
            rows={4}
            placeholder="备注（最多 200 字）…"
          />
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
                <code>value / defaultValue / onChange</code>
              </td>
              <td>原生受控契约直通（IME / autofill 白送）；形制与槽位挂容器，input 零样式</td>
            </tr>
            <tr>
              <td>
                <code>lead</code>
              </td>
              <td>前缀 icon（16px lucide；focus 时转 accent-text）</td>
            </tr>
            <tr>
              <td>
                <code>clearable</code>
              </td>
              <td>
                有值时容器 hover/focus 显现清空 ×（<code>tabIndex=-1</code> 不抢 Tab
                流，清空后焦点留在输入框）
              </td>
            </tr>
            <tr>
              <td>
                <code>size</code>
              </td>
              <td>
                <code>{"sm | md"}</code>（28 / 34px）
              </td>
            </tr>
            <tr>
              <td>
                <code>aria-invalid</code>
              </td>
              <td>
                错误态正源（判定归表单层）：容器经 has- 变体换 danger 描边 / danger-soft
                ring，视觉与读屏语义同源
              </td>
            </tr>
            <tr>
              <td>
                <code>readOnly / disabled</code>
              </td>
              <td>
                原生透传。只读 = 框在 + ink-2 + 默认光标 + 零响应；禁用 = 原生 disabled + 降透明
              </td>
            </tr>
            <tr>
              <td>
                <b>NumberInput</b>
              </td>
              <td>
                <code>{"value: number | null"}</code> + <code>onValueChange</code>；beforeinput
                事前拦截（粘贴清洗、 合法中间态放行、IME compositionend 兜底）、blur / Enter 归一化
              </td>
            </tr>
            <tr>
              <td>
                <b>Textarea</b>
              </td>
              <td>
                同形多行；<code>maxLength</code> 传值即出 <code>n / max</code> 计数器（超限 danger）
              </td>
            </tr>
            <tr>
              <td>
                <b>FormRow（占位）</b>
              </td>
              <td>
                label / 描述 / 错误的字段包装归 <code>ui/patterns</code>（当前{" "}
                <code>FormField</code> 为未经设计的占位迁移， 待 FormRow 设计稿后重做）
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
