import { useState } from "react";
import { CloudUpload, Folder, Globe, LayoutGrid, Link2, List } from "lucide-react";
import { Segmented } from "@tau/ui";
import { ApiCard, DocHead, MatrixRow } from "../kit";

export default function SegmentedSection() {
  const [range, setRange] = useState("week");
  const [density, setDensity] = useState("list");
  const [target, setTarget] = useState("local");
  return (
    <>
      <DocHead
        title="Segmented"
        en="segmented"
        src="packages/ui"
        duty="分段单选器（Input 家族「连体描边」语言，02 规范 §5.2 裁决的 Tabs 官定替代）：原生 radio 组语义，方向键即选。连体描边 + 段间 hairline，激活段 accent-soft 轻染——零轨道、零滑块。"
      />
      <MatrixRow
        name="状态矩阵"
        desc="连体描边（surface + line-1，段间 hairline 分割）：激活 = accent-soft 轻染，hover 淡墨只落未选段；段数口径 2–5，再多该用 Select"
      >
        <Segmented label="二段组" defaultValue="a">
          <Segmented.Item value="a" label="选项 A" />
          <Segmented.Item value="b" label="选项 B" />
        </Segmented>
        <Segmented label="三段组" defaultValue="a">
          <Segmented.Item value="a" label="一段" />
          <Segmented.Item value="b" label="二段" />
          <Segmented.Item value="c" label="三段" />
        </Segmented>
        <Segmented label="四段组" defaultValue="day">
          <Segmented.Item value="day" label="日" />
          <Segmented.Item value="week" label="周" />
          <Segmented.Item value="month" label="月" />
          <Segmented.Item value="year" label="年" />
        </Segmented>
        <Segmented label="五段（段数上限）" defaultValue="a">
          <Segmented.Item value="a" label="一" />
          <Segmented.Item value="b" label="二" />
          <Segmented.Item value="c" label="三" />
          <Segmented.Item value="d" label="四" />
          <Segmented.Item value="e" label="五" />
        </Segmented>
        <Segmented label="单项禁用" defaultValue="a">
          <Segmented.Item value="a" label="可用段" />
          <Segmented.Item value="b" label="禁用段" disabled />
        </Segmented>
        <Segmented label="锁定组" defaultValue="a" disabled>
          <Segmented.Item value="a" label="锁定段" />
          <Segmented.Item value="b" label="锁定段" />
        </Segmented>
      </MatrixRow>
      <MatrixRow
        name="图标段"
        desc="icon + label 常规组合；纯图标段（label 省略）aria-label 必填，命中面积不缩水"
      >
        <Segmented label="发布目标" value={target} onValueChange={setTarget}>
          <Segmented.Item value="local" label="本地" icon={Folder} />
          <Segmented.Item value="cloud" label="图床" icon={CloudUpload} />
        </Segmented>
        <Segmented label="纯图标组" defaultValue="globe">
          <Segmented.Item value="globe" icon={Globe} aria-label="公开访问" />
          <Segmented.Item value="link" icon={Link2} aria-label="仅链接可访问" />
        </Segmented>
      </MatrixRow>
      <MatrixRow
        name="场景 · 形态切换"
        desc="字段不同构的形态切换用分段、值切换用 Select；md 档 32 高（工具栏），sm 档 26 高（行内）"
      >
        <Segmented label="统计时间窗" size="md" value={range} onValueChange={setRange}>
          <Segmented.Item value="day" label="日" />
          <Segmented.Item value="week" label="周" />
          <Segmented.Item value="month" label="月" />
          <Segmented.Item value="year" label="年" />
        </Segmented>
        <Segmented label="视图密度" value={density} onValueChange={setDensity}>
          <Segmented.Item value="list" aria-label="列表视图" icon={List} />
          <Segmented.Item value="grid" aria-label="网格视图" icon={LayoutGrid} />
        </Segmented>
        <span className="text-tau-meta text-ink-3">
          {range} · {density}
        </span>
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
                <b>Segmented</b>
              </td>
              <td>
                复合组件（<code>Segmented.Item</code> 须包在组内）；
                <code>value / defaultValue / onValueChange</code>（受控契约）；
                <code>label</code> 渲染 <code>aria-label</code>（组名必填，不渲染可见标签）；
                <code>size: sm | md</code>；<code>icon</code> 图标段（label 省略时纯图标段，
                aria-label 必填）；组级 <code>disabled</code> 压单项；无 loading / error
                态——它是即时的形态切换，不是表单输入；Tabs 的官定替代（02 §5.2）， 段数口径
                2–5，再多用 Select
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
