/**
 * 尺度与动效档案 —— 字号 9 档 / 圆角 3 档 / 阴影 2 档 + 焦点环 / 动效与布局常量。
 * 尺度与主题正交（shadow 取值除外，随主题变——本档案顺带验证）。
 */

import { ApiCard, BlockTitle, CanvasCard, DocHead } from "../kit";

const TYPE_SCALE: [spec: string, cls: string, weight: string, sample: string][] = [
  ["text-tau-hero · 25px", "text-[25px]", "font-[650] tracking-[-0.01em]", "页面主标题 Aa"],
  ["text-tau-title-lg · 20px", "text-[20px]", "font-semibold", "区块大标题 Aa"],
  ["text-tau-title · 14.5px", "text-[14.5px]", "font-semibold", "面板标题 Aa"],
  ["text-tau-body-lg · 13.5px", "text-[13.5px]", "", "正文大号 Aa —— 卡片主文案"],
  ["text-tau-body · 13px / 1.65", "text-[13px]", "", "正文 Aa —— 默认正文行高 1.65"],
  ["text-tau-meta · 12.5px", "text-[12.5px]", "", "元信息 Aa —— 日期、路径"],
  ["text-tau-sm · 12px", "text-[12px]", "", "小字 Aa —— Toast、辅助说明"],
  ["text-tau-micro · 11.5px", "text-[11.5px]", "", "微字 Aa —— PanelNote"],
  ["text-tau-tiny · 11px", "text-[11px]", "", "极小字 Aa —— 角标、图例"],
];

export default function ScaleSection() {
  return (
    <>
      <DocHead
        title="尺度与动效"
        en="与主题正交的全局常量"
        duty="字号 / 圆角 / 阴影 / 动效 / 布局常量不随主题变，Tailwind 词一律 tau 命名空间。阴影两档取值随主题变（唯一的例外）。"
        src="src/ui/theme/tokens.css · @theme inline"
      />

      <CanvasCard cap="LIVE" note="字号阶梯 · 9 档" stageClassName="block">
        {TYPE_SCALE.map(([spec, cls, weight, sample]) => (
          <div
            key={spec}
            className="border-line-2 flex items-baseline gap-5 border-b py-2.5 last:border-b-0"
          >
            <span className="font-tau-mono text-tau-tiny text-ink-3 w-[196px] shrink-0">
              {spec}
            </span>
            <span className={`${cls} ${weight}`}>{sample}</span>
          </div>
        ))}
      </CanvasCard>

      <BlockTitle en="Radius">圆角三档</BlockTitle>
      <div className="flex flex-wrap gap-4 py-4">
        {(
          [
            ["rounded-tau-sm", "8", "rounded-[8px]"],
            ["rounded-tau-md", "12", "rounded-[12px]"],
            ["rounded-tau-lg", "16", "rounded-[16px]"],
          ] as const
        ).map(([word, px, cls]) => (
          <div
            key={word}
            className={`border-line-1 bg-surface text-ink-2 font-tau-mono grid h-[78px] w-[152px] place-items-center whitespace-nowrap border text-[11px] ${cls}`}
          >
            {word} {px}
          </div>
        ))}
      </div>

      <BlockTitle en="Shadow · 取值随主题变">阴影两档 + 焦点环</BlockTitle>
      <div className="flex flex-wrap gap-5 py-4">
        <div className="bg-surface text-ink-2 shadow-card rounded-tau-lg font-tau-mono grid h-24 w-[196px] place-items-center text-[11px]">
          shadow-card（Panel）
        </div>
        <div className="bg-surface text-ink-2 shadow-float rounded-tau-lg font-tau-mono grid h-24 w-[196px] place-items-center text-[11px]">
          shadow-float（浮层）
        </div>
        <div className="bg-surface text-ink-2 rounded-tau-lg font-tau-mono grid h-24 w-[196px] place-items-center text-[11px] [box-shadow:var(--tau-focus-ring)]">
          focus-ring（键盘焦点）
        </div>
      </div>

      <BlockTitle en="Motion & Layout">动效与布局常量</BlockTitle>
      <ApiCard title="常量速查">
        <table>
          <tbody>
            <tr>
              <th>
                <code>ease-tau-out</code>
              </th>
              <td>
                <code>cubic-bezier(0.22, 1, 0.36, 1)</code> · 唯一缓动；fast 160ms（hover 类） /
                normal 240ms（布局类）
              </td>
            </tr>
            <tr>
              <th>
                <code>animate-hm-pulse</code>
              </th>
              <td>热力图 hover 呼吸 0.5s alternate infinite</td>
            </tr>
            <tr>
              <th>布局常量</th>
              <td>
                sidebar <code>--tau-sidebar-w</code> 218 / 折叠 58 · titlebar 46 · statusbar 30 ·
                content-pad 34
              </td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
