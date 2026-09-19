/**
 * Popover 档案 —— 锚定式可交互内容浮层（D-014）。
 * 头行与 footer 随需出现的四种形态各陈列一件（说明卡有头行 / 色板无头行 /
 * 成员卡头像即头 / 过滤器头行 + footer + 二级 Popover 嵌套）；
 * 外点、Esc 焦点链、Tab 移出、嵌套链与顶层互斥键盘全可用。
 */

import { useRef, useState } from "react";
import clsx from "clsx";
import { Repeat2, SlidersHorizontal } from "lucide-react";
import { Popover } from "@tau/ui/Popover";
import { AnchoredPanel } from "@tau/ui/AnchoredPanel";
import { ApiCard, BlockTitle, CanvasCard, DemoButton, DocHead, MatrixRow, Note } from "../kit";

/** 应答区按钮（Button 落地后迁移；与 DialogSection 同款形制） */
const BTN =
  "inline-flex h-[34px] items-center justify-center gap-[7px] rounded-[10px] px-[17px] " +
  "text-tau-body ease-tau-out outline-none focus-visible:shadow-[var(--tau-focus-ring)] " +
  "transition-[background,border-color,opacity] duration-[140ms] disabled:pointer-events-none disabled:opacity-45";
const BTN_PRIMARY = clsx(BTN, "bg-accent text-ink-inverse font-[600] hover:bg-accent-hover");
const BTN_SECOND = clsx(
  BTN,
  "border-line-1 bg-surface text-ink-1 font-[550] border hover:border-ink-3"
);
const CHIP =
  "inline-flex h-[26px] items-center rounded-full border px-3 text-[12px] transition-colors duration-[130ms] ease-tau-out";
const CHIP_OFF = clsx(CHIP, "border-line-1 bg-surface text-ink-2 hover:border-ink-3");
const CHIP_ON = clsx(CHIP, "border-accent bg-accent-soft text-accent-text font-[550]");

const COLORS: Array<[string, string]> = [
  ["#c8553d", "赤陶"],
  ["#d97e66", "珊瑚"],
  ["#c9a869", "金盏"],
  ["#8faa7a", "苔绿"],
  ["#5f8d7c", "松石"],
  ["#7a9bb0", "雾蓝"],
  ["#8a7aa6", "紫烟"],
  ["#a08a7a", "暖灰"],
];

const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl + K", "命令面板（内容 + 命令混合检索）"],
  ["Alt + ←/→", "后退 / 前进"],
  ["Esc", "先关最上层浮层，再后退"],
  ["Ctrl + 1…4", "切换工作台页面"],
  ["Ctrl + \\", "折叠 / 展开侧栏"],
  ["Ctrl + B", "粗体"],
  ["[[", "插入卡片链接"],
  ["Ctrl + Enter", "保存并下一张"],
  ["空格", "显示答案"],
  ["1 / 2 / 3 / 4", "忘记 / 模糊 / 记得 / 轻松"],
  ["Enter", "下一张"],
  ["Ctrl + Z", "撤销上次评分"],
];

export default function PopoverSection() {
  const [color, setColor] = useState(6);
  const [type, setType] = useState(0);
  const [weakOnly, setWeakOnly] = useState(true);
  const [hosted, setHosted] = useState(false);
  const hostedAnchor = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DocHead
        title="Popover"
        en="primitives/Popover.tsx"
        duty="锚定式可交互内容浮层（非模态）。点击触发、内容可继续操作——说明卡 / 过滤器组 / 色板 / 成员卡 / 卡片预览；家族分工里它收下 Tooltip（瞬态说明，不可交互）与 Menu（命令面板）、Dialog（模态决策）之间的最大一块。定位 12 向全表 + flip/shift，外点关闭、嵌套链共存、顶层互斥、Esc 焦点链全部内建。"
        src="packages/ui/src/primitives/Popover.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="全部标本可交互：Esc 关闭 · 点外关闭 · Tab 移出即关 · 过滤器里开「高级选项」看二级浮层"
        stageClassName="flex flex-col gap-6"
      >
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            ref={hostedAnchor}
            className={clsx(BTN, BTN_SECOND)}
            onClick={() => setHosted(previous => !previous)}
          >
            AnchoredPanel（宿主托管）
          </button>
          {hosted && (
            <AnchoredPanel anchor={hostedAnchor.current} className="w-[300px]">
              <AnchoredPanel.Body>
                面板没有自己的开合：宿主 state 在它就在，卸载即消失。不监听外点、不消费
                Esc/Tab（这些事件原样冒泡给宿主），定位与卡片视觉与 Popover 同源。适合
                「浮层即交互会话一部分」的场景，如行内编辑器的选项面板。
              </AnchoredPanel.Body>
            </AnchoredPanel>
          )}

          <Popover trigger={<DemoButton>间隔重复？</DemoButton>} placement="top">
            <Popover.Header icon={<Repeat2 />}>间隔重复 · Spaced Repetition</Popover.Header>
            <Popover.Body>
              按「遗忘曲线」在即将忘记的临界点安排复习：答对的卡片间隔拉长（1d → 3d → 7d →
              21d），答错的重置。Tau 的到期队列由复习记录自动推算，无需手动排期。
            </Popover.Body>
          </Popover>

          <Popover
            trigger={
              <DemoButton>
                <span
                  className="border-ink-1/10 inline-block size-3.5 rounded-[5px] border"
                  style={{ background: COLORS[color][0] }}
                />
                {COLORS[color][1]}
              </DemoButton>
            }
            placement="bottom"
          >
            <Popover.Body className="pb-3">
              <div className="grid grid-cols-8 gap-2">
                {COLORS.map(([hex, name], i) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={name}
                    onClick={() => setColor(i)}
                    className={clsx(
                      "border-ink-1/10 size-[30px] rounded-[9px] border",
                      i === color &&
                        "shadow-[0_0_0_2px_var(--tau-bg-surface),0_0_0_4px_var(--tau-accent)]"
                    )}
                    style={{ background: hex }}
                  />
                ))}
              </div>
              <div className="text-ink-3 mt-3 text-[11.5px]">选中即应用 · {COLORS[color][1]}</div>
            </Popover.Body>
          </Popover>

          <Popover trigger={<DemoButton>协作者…</DemoButton>} placement="bottom">
            <Popover.Body className="pb-3">
              <div className="flex items-start gap-3">
                <div className="bg-accent-soft text-accent-text grid size-[42px] place-items-center rounded-[12px] text-[16px] font-[650]">
                  潇
                </div>
                <div className="min-w-0">
                  <div className="text-ink-1 flex items-center gap-[7px] text-[13.5px] font-[600]">
                    林潇 <span className="bg-ok inline-block size-[7px] rounded-full" />
                  </div>
                  <div className="text-ink-3 mt-px text-[11.5px]">xiao@tau.app</div>
                  <div className="text-ink-2 mt-1.5 text-[12px]">
                    3 篇共同编辑 · 上次活跃 2 小时前
                  </div>
                </div>
              </div>
            </Popover.Body>
            <Popover.Footer>
              <button type="button" className={BTN_SECOND}>
                发消息
              </button>
              <button type="button" className={BTN_PRIMARY}>
                查看资料
              </button>
            </Popover.Footer>
          </Popover>

          <Popover trigger={<DemoButton>快捷键…</DemoButton>} placement="bottom-end">
            <Popover.Header>快捷键</Popover.Header>
            <Popover.Body className="max-h-[264px]">
              {SHORTCUTS.map(([keys, desc]) => (
                <div
                  key={keys}
                  className="border-line-2 flex items-center gap-3 border-b py-[7px] last:border-b-0"
                >
                  <kbd className="border-line-1 bg-surface text-ink-2 font-tau-mono w-[92px] flex-none rounded-[5px] border border-b-2 px-[7px] py-[2px] text-center text-[11px]">
                    {keys}
                  </kbd>
                  <span className="text-[12.5px]">{desc}</span>
                </div>
              ))}
            </Popover.Body>
          </Popover>
        </div>
        <Note>
          四种头行形态：说明卡有头行（icon + 标题 + ×）、色板无头行（纯内容零框架税）、
          成员卡头像即头、快捷键表头行钉住 + 正文滚动渐隐（edge fade）。footer 只有
          需要显式应答的过滤器才有。
        </Note>
      </CanvasCard>

      <BlockTitle en="行为标本">状态矩阵</BlockTitle>
      <MatrixRow
        name="关闭矩阵与键盘"
        desc={
          <>
            点外 / Esc / × / Tab 移出皆可关；Esc 与 Tab 还焦触发器；非模态不圈闭焦点。
            <code>Esc</code> 不冒泡成页面后退（焦点链 LIFO，同 Select/Menu/Dialog 口径）。
          </>
        }
        trayClassName="items-center"
      >
        <Popover trigger={<DemoButton>试键盘</DemoButton>}>
          <Popover.Body>
            打开后焦点在卡片上：Esc 关、Tab 移出即关（还焦触发器）、方向键无预设导航——
            内容任意，列表导航归 Menu / Select。
          </Popover.Body>
        </Popover>
      </MatrixRow>
      <MatrixRow
        name="嵌套链与顶层互斥"
        desc={
          <>
            过滤器内的「高级选项」是二级 Popover：点二级内容不算外点（一级不关）、Esc
            先关二级；开另一个顶层 Popover 时旧的自动收。浮层内开 Menu / Select 同理共存。
          </>
        }
        trayClassName="items-center"
      >
        <Popover trigger={<DemoButton>筛选卡片…</DemoButton>} placement="bottom-start">
          <Popover.Header icon={<SlidersHorizontal />}>筛选卡片</Popover.Header>
          <Popover.Body>
            <div className="mb-3.5">
              <div className="text-ink-2 mb-1.5 text-[12px] font-[550]">类型</div>
              <div className="flex flex-wrap gap-1.5">
                {["全部", "卡片", "文章", "日记"].map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    className={i === type ? CHIP_ON : CHIP_OFF}
                    onClick={() => setType(i)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              role="checkbox"
              aria-checked={weakOnly}
              onClick={() => setWeakOnly(v => !v)}
              className="text-ink-2 flex items-center gap-2 text-[12.5px]"
            >
              <span
                className={clsx(
                  "ease-tau-out grid size-[15px] place-items-center rounded-[4px] border-[1.5px] transition-colors duration-[130ms]",
                  weakOnly ? "border-accent bg-accent" : "border-ink-3 bg-surface"
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={clsx(
                    "text-ink-inverse size-[11px] transition-opacity duration-[130ms]",
                    weakOnly ? "opacity-100" : "opacity-0"
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              仅看未掌握的卡片
            </button>
            <div className="mt-3">
              <Popover
                trigger={
                  <DemoButton style={{ height: 28, padding: "0 12px", fontSize: 12 }}>
                    高级选项…
                  </DemoButton>
                }
                placement="right-start"
              >
                <Popover.Header>高级选项</Popover.Header>
                <Popover.Body>
                  <div className="text-ink-2 flex items-center gap-1.5 text-[12.5px]">
                    掌握度
                    <input
                      defaultValue="0"
                      className="border-line-1 bg-surface text-ink-1 rounded-tau-sm h-[28px] w-[66px] border px-2 text-center text-[12.5px] outline-none"
                    />
                    <span className="text-ink-3">—</span>
                    <input
                      defaultValue="100"
                      className="border-line-1 bg-surface text-ink-1 rounded-tau-sm h-[28px] w-[66px] border px-2 text-center text-[12.5px] outline-none"
                    />
                  </div>
                </Popover.Body>
                <Popover.Footer>
                  <button type="button" className={BTN_PRIMARY}>
                    完成
                  </button>
                </Popover.Footer>
              </Popover>
            </div>
          </Popover.Body>
          <Popover.Footer>
            <button type="button" className={BTN_SECOND}>
              重置
            </button>
            <button type="button" className={BTN_PRIMARY}>
              应用
            </button>
          </Popover.Footer>
        </Popover>
      </MatrixRow>
      <MatrixRow
        name="与 Tooltip / Menu 的分界"
        desc={
          <>
            hover 说明 → <code>Tooltip</code>（瞬态、不可交互）；命令面板 / 异构菜单项 →
            <code>Menu</code>；表单值选择 → <code>Select</code>；模态决策 → <code>Dialog</code>。
            antd 存量 <code>Popover trigger="hover"</code> 迁 Tooltip，placement 12 向同名直映。
          </>
        }
        trayClassName="items-center"
      >
        <Popover trigger={<DemoButton>分界自查</DemoButton>}>
          <Popover.Body>
            「点了才出现、里面可以继续操作」是 Popover；扫过即逝的一行提示是 Tooltip；
            这条线画清了，两个组件都不会变差。
          </Popover.Body>
        </Popover>
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
                <code>trigger</code>
              </td>
              <td>
                触发器（克隆注入开合事件 / aria / ref）——元素必须透传 props 与 ref， 协议同 Tooltip
                / Menu
              </td>
            </tr>
            <tr>
              <td>
                <code>placement</code>
              </td>
              <td>
                12 向全表（<code>top | right | bottom | left</code>，可带
                <code>-start | -center | -end</code>），默认 <code>top</code>；flip/shift 由引擎兜底
              </td>
            </tr>
            <tr>
              <td>
                <code>open / onOpenChange</code>
              </td>
              <td>浮层受控（§5.3 契约）；受控即接管开合时机</td>
            </tr>
            <tr>
              <td>
                <code>arrow</code>
              </td>
              <td>8px 菱形箭头（默认开，随 flip 自动换边，与 Tooltip 同几何）</td>
            </tr>
            <tr>
              <td>
                <code>className</code>
              </td>
              <td>
                透传浮层卡片（宽度控制如 <code>w-[360px]</code>，覆盖 180–340 约束）
              </td>
            </tr>
            <tr>
              <td>
                <code>Popover.Header · icon</code>
              </td>
              <td>头行随需：icon 圆底 + 标题 + ghost ×（挂 aria-labelledby）</td>
            </tr>
            <tr>
              <td>
                <code>Popover.Body · className</code>
              </td>
              <td>正文：独立滚动（上限 60vh）+ 边缘渐隐（edge fade 三件套，Dialog 同构）</td>
            </tr>
            <tr>
              <td>
                <code>Popover.Footer</code>
              </td>
              <td>应答区随需：hairline 之上按钮右对齐，主按钮恒在最右</td>
            </tr>
          </tbody>
        </table>
        <Note>
          内建行为（不做成 props）：click toggle（hover 说明归 Tooltip，不设 trigger props）·
          定位引擎全表 + gap 8 · scroll/resize 跟随（useAnchoredPosition）· 外点关闭 + 嵌套链共存 +
          顶层互斥（useLayerDismiss）· Esc 焦点 LIFO · Tab 移出即关 · 初始焦点落{" "}
          <code>data-autofocus</code>（无则卡片）· aria dialog / haspopup / expanded。
        </Note>
      </ApiCard>
    </>
  );
}
