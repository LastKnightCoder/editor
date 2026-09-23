import { useState } from "react";
import { Radio, RadioGroup } from "@tau/ui";
import { ApiCard, DocHead, MatrixRow } from "../kit";

export default function RadioSection() {
  const [theme, setTheme] = useState("cream");
  const [mode, setMode] = useState("merge");
  const [cadence, setCadence] = useState("daily");
  return (
    <>
      <DocHead
        title="Radio"
        en="radio · radio group"
        src="packages/ui"
        duty="单选基础件（Input 方案 A「经典描边」语言）：fieldset/legend + 原生 radio 组语义，Tab 一次进组、方向键即选。选中 = accent 环 + 中心点 110ms 进场，形制是 Checkbox 的圆形同构。"
      />
      <MatrixRow
        name="状态矩阵"
        desc="选中 = accent 环 + 中心点 110ms 进场（描边维度的状态变化）；选中压过 aria-invalid；组级 disabled 走 fieldset 原生传播"
      >
        <RadioGroup label="互斥组" defaultValue="a">
          <Radio value="a" label="选中项" />
          <Radio value="b" label="未选项" />
        </RadioGroup>
        <RadioGroup label="必选组" defaultValue="a">
          <Radio value="a" label="已选项" />
          <Radio value="b" label="必选项" aria-invalid />
        </RadioGroup>
        <RadioGroup label="单项禁用" defaultValue="a">
          <Radio value="a" label="可用项" />
          <Radio value="b" label="禁用项" disabled />
        </RadioGroup>
        <RadioGroup label="锁定组" defaultValue="a" disabled>
          <Radio value="a" label="锁定项 · 选中" />
          <Radio value="b" label="锁定项" />
        </RadioGroup>
      </MatrixRow>
      <MatrixRow
        name="组合式 · 描述行"
        desc="description 两行排布顶对齐（只有组合式 children 能表达）；纵向组用于向导/表单区块"
      >
        <RadioGroup
          label="同步频率"
          orientation="vertical"
          value={cadence}
          onValueChange={setCadence}
        >
          <Radio value="realtime" label="实时" description="改动即时推送，适合协作场景" />
          <Radio value="daily" label="每日" description="每天 02:00 汇总同步，省电省流量" />
          <Radio value="manual" label="手动" description="仅在点击「立即同步」时拉取" />
        </RadioGroup>
      </MatrixRow>
      <MatrixRow
        name="受控 · 界面主题"
        desc="value + onValueChange 受控（省略则 defaultValue 非受控）；「跟随系统」单项禁用演示"
      >
        <div className="flex flex-wrap items-center gap-6">
          <RadioGroup label="界面主题" value={theme} onValueChange={setTheme}>
            <Radio value="cream" label="奶油" />
            <Radio value="cocoa" label="可可" />
            <Radio value="system" label="跟随系统" disabled />
          </RadioGroup>
          <span className="text-tau-meta text-ink-3">value = {theme}</span>
        </div>
      </MatrixRow>
      <MatrixRow
        name="场景 · 导入向导"
        desc="纵向 + description + 单项禁用：选项含义需要解释、且存在不可用项时的典型形态"
      >
        <RadioGroup label="导入方式" orientation="vertical" value={mode} onValueChange={setMode}>
          <Radio value="merge" label="追加导入" description="新卡片追加到库末尾，不动现有内容" />
          <Radio
            value="overwrite"
            label="覆盖导入"
            description="清空现有卡片后全量导入（不可撤销）"
          />
          <Radio
            value="skip"
            label="跳过冲突"
            description="与现有卡片重复时跳过（需 2.0 版导入文件）"
            disabled
          />
        </RadioGroup>
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
                <b>RadioGroup</b>
              </td>
              <td>
                <code>value / defaultValue / onValueChange</code>（受控契约）；
                <code>label</code> 渲染 legend（组名必填，读屏必读）；
                <code>orientation: horizontal | vertical</code>；<code>name</code> 默认 useId
                生成；组级 <code>disabled</code> 走 fieldset 原生传播
              </td>
            </tr>
            <tr>
              <td>
                <b>Radio</b>
              </td>
              <td>
                原生 <code>input[type=radio]</code> 透传，须包在 RadioGroup 内（经 context 取
                name/受控值）；
                <code>label</code> 主标签、<code>description</code> 描述行（两行排布顶对齐）；
                错误态正源 <code>aria-invalid</code>（选中优先）；antd Radio.Button 分段形态不建——归
                Segmented
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
