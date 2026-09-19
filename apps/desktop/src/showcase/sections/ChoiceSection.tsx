import { useState } from "react";
import { Checkbox, Radio, RadioGroup, Switch } from "@tau/ui";
import { ApiCard, DocHead, MatrixRow } from "../kit";

export default function ChoiceSection() {
  const [sync, setSync] = useState(true);
  const [spell, setSpell] = useState(false);
  const [all, setAll] = useState(false);
  const [some, setSome] = useState(true);
  const [done, setDone] = useState([true, false, false]);
  const [mode, setMode] = useState("merge");
  const [theme, setTheme] = useState("cream");
  return (
    <>
      <DocHead
        title="Checkbox · Switch · Radio"
        en="checkbox · switch · radio"
        src="packages/ui"
        duty="勾选、开关与单选（Input 方案 A 语言）：原生语义载体 + 自绘形制，命中 24×24，focus-visible 显 ring。"
      />
      <MatrixRow
        name="Checkbox 状态"
        desc="选中 accent 实底 + 勾 110ms 淡入；错误走 aria-invalid；无动效 prop"
      >
        <Checkbox label="默认" />
        <Checkbox label="选中" defaultChecked />
        <Checkbox label="半选" indeterminate />
        <Checkbox label="禁用" disabled defaultChecked />
        <Checkbox label="必选项" aria-invalid />
      </MatrixRow>
      <MatrixRow
        name="Checkbox 场景"
        desc="任务清单：行内勾选；半选由调用方联动（部分勾选 → indeterminate）"
      >
        <div className="flex w-[340px] flex-col gap-1">
          <div className="border-line-1 flex items-center gap-2 border-b pb-2">
            <Checkbox
              label={
                done.every(Boolean)
                  ? "取消全选"
                  : done.some(Boolean)
                    ? `已选 ${done.filter(Boolean).length} / ${done.length}`
                    : "选择全部"
              }
              checked={done.every(Boolean)}
              indeterminate={done.some(Boolean) && !done.every(Boolean)}
              onChange={() => setDone(done.map(() => !done.every(Boolean)))}
            />
          </div>
          {["梳理组件取舍", "拦截链路测试", "样板间档案"].map((name, i) => (
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
        name="Switch 状态"
        desc="轨道是槽（bg-track 控件轨道 token）、thumb 是浮起物；role=switch 语义"
      >
        <Switch checked={sync} onCheckedChange={setSync} label="自动同步" />
        <Switch checked={spell} onCheckedChange={setSpell} label="拼写检查" />
        <Switch size="sm" checked={all} onCheckedChange={setAll} label="sm 档" />
        <Switch checked={some} onCheckedChange={setSome} label="拨动试试" />
        <Switch aria-label="企业策略锁定" disabled label="企业锁定" />
      </MatrixRow>
      <MatrixRow
        name="Radio 状态"
        desc="选中 = accent 环 + 中心点 110ms 进场（描边维度的状态变化）；原生 radio 组语义，Tab 一次进组、方向键即选；选中压过 aria-invalid"
      >
        <RadioGroup label="互斥组" defaultValue="a">
          <Radio value="a" label="选中项" />
          <Radio value="b" label="未选项" />
        </RadioGroup>
        <RadioGroup label="必选组" defaultValue="a">
          <Radio value="a" label="已选项" />
          <Radio value="b" label="必选项" aria-invalid />
        </RadioGroup>
        <RadioGroup label="锁定组" disabled>
          <Radio value="a" label="锁定项" />
        </RadioGroup>
      </MatrixRow>
      <MatrixRow
        name="Radio 场景"
        desc="组合式 children（描述行只有组合式能表达）：主题组横向受控，导入向导纵向 + description + 单项禁用"
      >
        <RadioGroup label="界面主题" value={theme} onValueChange={setTheme}>
          <Radio value="cream" label="奶油" />
          <Radio value="cocoa" label="可可" />
          <Radio value="system" label="跟随系统" disabled />
        </RadioGroup>
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
                <b>Switch</b>
              </td>
              <td>
                <code>checked / defaultChecked / onCheckedChange</code>（受控契约）；
                <code>label</code> 渲染在左（点文字切换；纯读屏标签用 <code>aria-label</code>）；
                <code>size: sm | md</code>；<code>role=switch</code> + <code>aria-checked</code>，
                Space/Enter 原生切换；轨道消费 <code>bg-track</code> token
              </td>
            </tr>
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
            <tr>
              <td>
                <b>bg-track token</b>
              </td>
              <td>
                控件轨道语义（开关/未来滑杆槽）：非表面阶梯的部件色——cream <code>#e0d6c3</code> /
                cocoa <code>#463d31</code>（亮于 surface 使 thumb 可辨）；新增主题零组件改动
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
