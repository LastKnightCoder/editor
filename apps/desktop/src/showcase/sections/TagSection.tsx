import { useState } from "react";
import { Tag, type TagColor } from "@tau/ui";
import { ApiCard, DocHead, MatrixRow } from "../kit";

const PALETTE: Array<{ color: TagColor; label: string }> = [
  { color: "red", label: "红 · 重要" },
  { color: "orange", label: "橙" },
  { color: "yellow", label: "黄" },
  { color: "green", label: "绿" },
  { color: "blue", label: "蓝" },
  { color: "purple", label: "紫" },
];

export default function TagSection() {
  const [filters, setFilters] = useState(["架构", "重构", "本月"]);
  return (
    <>
      <DocHead
        title="Tag"
        en="tag"
        src="packages/ui"
        duty="值展示标签（A+B 结合 II「点 + 软底」）：soft 底 + 同系 solid 文字 + 可选色点——三层同色阶；纯展示 span，onRemove 数据驱动显 ×。"
      />
      <MatrixRow
        name="色板"
        desc="7 分类色与 ColorSwatch 同源，语义状态复用色板；gray 无点（无色 = 无分类）"
      >
        <Tag>未分类</Tag>
        {PALETTE.map(({ color, label }) => (
          <Tag key={color} color={color}>
            {label}
          </Tag>
        ))}
      </MatrixRow>
      <MatrixRow
        name="语义状态 + showDot"
        desc="点默认开（色相焦点）；状态词自带语义时可关点退化为纯软底"
      >
        <Tag color="green">已完成</Tag>
        <Tag color="yellow">进行中</Tag>
        <Tag color="red">已逾期</Tag>
        <Tag color="blue">同步中</Tag>
        <Tag>草稿</Tag>
        <span className="bg-line-2 ml-2 w-px self-stretch" />
        <Tag color="green" showDot={false}>
          已完成
        </Tag>
        <Tag color="red" showDot={false}>
          已逾期
        </Tag>
      </MatrixRow>
      <MatrixRow
        name="场景"
        desc="过滤条件条（closable 主场，× 点击即移除不冒泡）+ 数据库选项排布（truncate 靠容器约束）"
      >
        <div className="rounded-tau-md border-line-1 bg-surface flex min-h-[46px] flex-wrap items-center gap-2 border p-2">
          {filters.map(name => (
            <Tag
              key={name}
              color="blue"
              onRemove={() => setFilters(filters.filter(f => f !== name))}
            >
              {name}
            </Tag>
          ))}
          {filters.length === 0 && (
            <span className="text-ink-3 text-tau-meta px-1">无过滤条件</span>
          )}
          <span className="text-ink-3 border-line-1 text-tau-sm ml-auto flex h-[30px] min-w-[120px] flex-1 items-center rounded-[9px] border border-dashed px-2.5">
            添加过滤条件…
          </span>
        </div>
        <div className="flex max-w-[320px] flex-wrap gap-1.5">
          {PALETTE.map(({ color, label }) => (
            <Tag key={color} color={color}>
              {label}
            </Tag>
          ))}
          <Tag color="purple">一个特别长的标签名称会被截断</Tag>
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
                <b>color</b>
              </td>
              <td>
                7 色板（<code>red/orange/yellow/green/gray(默认)/blue/purple</code>），与
                ColorSwatch 同源； 语义状态复用色板，不另设 status；orange 的文字走{" "}
                <code>accent-text</code>、点走 <code>accent</code>（分语义位）
              </td>
            </tr>
            <tr>
              <td>
                <b>showDot</b>
              </td>
              <td>
                色相焦点（A 的点），默认开；<code>gray</code> 恒无点（无色 = 无分类）；
                关闭退化为纯软底形态（状态词场景）
              </td>
            </tr>
            <tr>
              <td>
                <b>onRemove</b>
              </td>
              <td>
                传了才渲染 ×（<code>button</code> + <code>aria-label="移除"</code>）；热区 24（视觉
                16， 伪元素外扩不撑破 22px 药丸）、<code>focus-visible</code> 才显 ring、点击{" "}
                <code>stopPropagation</code>
              </td>
            </tr>
            <tr>
              <td>
                <b>形制</b>
              </td>
              <td>
                药丸单尺寸（高 22、<code>tau-sm</code> 字）无档；长文本 <code>truncate</code>{" "}
                由容器约束
                <code>max-width</code>；antd 的 bordered/icon/Clickable/Checkable 不迁
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
