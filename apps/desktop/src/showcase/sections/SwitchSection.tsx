import { useState, type ReactNode } from "react";
import { Switch } from "@tau/ui";
import { ApiCard, DocHead, MatrixRow } from "../kit";

/** 设置行标本：可见文字由行承载（label prop 渲染在紧邻开关左侧，行式布局两端对齐时不适用） */
function SettingRow({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="border-line-1 flex items-center justify-between gap-6 border-b py-3 last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <span className="text-ink-1 text-tau-body">{title}</span>
        <span className="text-tau-meta text-ink-3">{desc}</span>
      </span>
      {children}
    </div>
  );
}

export default function SwitchSection() {
  const [sync, setSync] = useState(true);
  const [spell, setSpell] = useState(false);
  const [compact, setCompact] = useState(true);
  const [quiet, setQuiet] = useState(false);
  const [muted, setMuted] = useState(false);
  const [telemetry, setTelemetry] = useState(true);
  const [beta, setBeta] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  return (
    <>
      <DocHead
        title="Switch"
        en="switch"
        src="packages/ui"
        duty="开关基础件（Input 方案 A 语言）：button[role=switch] 承载开/关值语义，Space/Enter 原生切换。轨道是槽（bg-track 控件轨道 token）、thumb 是浮起物，拨动 160ms ease-out。"
      />
      <MatrixRow
        name="状态矩阵"
        desc="sm 档用于行内紧凑区（FilterBar）；裸开关（无 label）须配 aria-label；禁用降透明"
      >
        <Switch checked={sync} onCheckedChange={setSync} label="开启 · md" />
        <Switch checked={spell} onCheckedChange={setSpell} label="关闭 · md" />
        <Switch size="sm" checked={compact} onCheckedChange={setCompact} label="开启 · sm" />
        <Switch size="sm" checked={quiet} onCheckedChange={setQuiet} label="关闭 · sm" />
        <Switch disabled defaultChecked label="禁用 · 开" />
        <Switch disabled label="禁用 · 关" />
        <Switch checked={muted} onCheckedChange={setMuted} aria-label="静音通知" />
      </MatrixRow>
      <MatrixRow
        name="场景 · 设置行"
        desc="行式布局中可见文字由行的排布承载，开关只传 aria-label（读屏）；描述行是调用方排布，不是组件 prop"
      >
        <div className="border-line-1 bg-surface rounded-tau-md w-[400px] border px-4">
          <SettingRow title="自动同步" desc="每 15 分钟同步一次工作区">
            <Switch checked={sync} onCheckedChange={setSync} aria-label="自动同步" />
          </SettingRow>
          <SettingRow title="匿名遥测" desc="帮助改进产品，不收集笔记内容">
            <Switch checked={telemetry} onCheckedChange={setTelemetry} aria-label="匿名遥测" />
          </SettingRow>
          <SettingRow title="Beta 通道" desc="提前体验实验性功能，稳定性较低">
            <Switch checked={beta} onCheckedChange={setBeta} aria-label="Beta 通道" />
          </SettingRow>
        </div>
      </MatrixRow>
      <MatrixRow
        name="受控 · 联动显隐"
        desc="checked 驱动下游内容显隐（受控契约）；关闭即卸载，重开回到初始态"
      >
        <div className="flex w-[340px] flex-col gap-3">
          <Switch checked={advanced} onCheckedChange={setAdvanced} label="显示高级选项" />
          {advanced && (
            <div className="border-line-1 text-tau-meta text-ink-2 rounded-tau-md border border-dashed px-3.5 py-3 leading-[1.7]">
              高级选项区：标签归一化 · 去重阈值 · 导出模板——由开关受控显隐
            </div>
          )}
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
                <b>bg-track token</b>
              </td>
              <td>
                控件轨道语义（开关/未来滑杆槽）：非表面阶梯的部件色——暖纸浅色 <code>#e0d6c3</code> /
                深色 <code>#463d31</code>（亮于 surface 使 thumb 可辨）；新增主题零组件改动
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
