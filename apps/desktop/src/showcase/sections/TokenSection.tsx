/**
 * Token 色板档案 —— 色芯按 token 的**真实用法**呈现，而不是一律涂方块：
 *  - fill：色块，半透明 token 叠在两色实体棋格上（原实现用 `transparent` 参与
 *    渐变插值，sRGB 下会插出黑色，整块呈现为脏绿棋盘——已修）；
 *  - text：直接用该墨色渲染一行字，比色块更能回答「够不够黑」；
 *  - line：放大成 3px 条，1px 发丝线在本页尺度下不可见。
 * 色值一律走 CSS 变量内联（D-001 允许，取值随 data-theme 级联，无需重算）。
 */

import { useThemeStore } from "@tau/ui/theme/runtime";
import { BlockTitle, DocHead, Note } from "../kit";

type Kind = "fill" | "text" | "line";
type Token = [name: string, cn: string, kind?: Kind];

const GROUPS: { title: string; en: string; tokens: Token[] }[] = [
  {
    title: "背景",
    en: "Background",
    tokens: [
      ["bg-page", "页面底"],
      ["bg-surface", "表面/白卡"],
      ["bg-group", "分组底"],
      ["bg-sunken", "沉底/轨道"],
      ["bg-hover", "悬停", "fill"],
      ["bg-press", "按下"],
      ["bg-selected", "选中"],
      ["bg-overlay", "遮罩"],
    ],
  },
  {
    title: "墨色",
    en: "Ink",
    tokens: [
      ["ink-1", "主墨 · 正文", "text"],
      ["ink-2", "次墨 · 说明", "text"],
      ["ink-3", "弱墨 · 占位", "text"],
      ["ink-inverse", "反相墨 · accent 实底上"],
    ],
  },
  {
    title: "线",
    en: "Line",
    tokens: [
      ["line-1", "常规描边", "line"],
      ["line-2", "弱分隔 · 行间", "line"],
    ],
  },
  {
    title: "品牌",
    en: "Accent",
    tokens: [
      ["accent", "品牌 / 主按钮"],
      ["accent-hover", "品牌悬停"],
      ["accent-soft", "品牌弱底"],
      ["accent-text", "品牌文字"],
    ],
  },
  {
    title: "语义",
    en: "Semantic",
    tokens: [
      ["ok", "成功"],
      ["ok-soft", "成功弱底"],
      ["danger", "错误"],
      ["danger-soft", "错误弱底"],
      ["warn", "警告"],
      ["warn-soft", "警告弱底"],
      ["info", "信息"],
      ["info-soft", "信息弱底"],
    ],
  },
  {
    title: "标签五色",
    en: "Tag",
    tokens: [
      ["tag-1", "标签 1"],
      ["tag-1-soft", "标签 1 底"],
      ["tag-2", "标签 2"],
      ["tag-2-soft", "标签 2 底"],
      ["tag-3", "标签 3"],
      ["tag-3-soft", "标签 3 底"],
      ["tag-4", "标签 4"],
      ["tag-4-soft", "标签 4 底"],
      ["tag-5", "标签 5"],
      ["tag-5-soft", "标签 5 底"],
    ],
  },
];

/** 色芯：按 kind 渲染真实用法（色值一律经 CSS 变量，不写死） */
function Swatch({ name, kind }: { name: string; kind: Kind }) {
  if (kind === "text") {
    return (
      <div className="border-line-2 bg-surface rounded-tau-sm flex h-11 items-center border px-3">
        <span style={{ color: `var(--tau-${name})` }} className="text-tau-body-lg font-[550]">
          Aa 文字示例
        </span>
      </div>
    );
  }
  if (kind === "line") {
    return (
      <div className="border-line-2 bg-surface rounded-tau-sm flex h-11 items-center border px-2.5">
        <span
          style={{ backgroundColor: `var(--tau-${name})` }}
          className="h-[3px] w-full rounded-full"
        />
      </div>
    );
  }
  return (
    <div
      className="border-line-1 rounded-tau-sm h-11 border"
      style={{
        // 第一层是该 token 自身（半透明时透出下面两色实体棋格），第二层是棋格。
        // 刻意不用 `transparent`：它等于 rgba(0,0,0,0)，渐变插值会带出黑边。
        backgroundImage: `linear-gradient(var(--tau-${name}), var(--tau-${name})), repeating-conic-gradient(var(--tau-line-2) 0% 25%, var(--tau-bg-surface) 0% 50%)`,
        backgroundSize: "auto, 16px 16px",
      }}
    />
  );
}

export default function TokenSection() {
  // resolved 变化（切主题 / 系统跟随）触发重渲染 → 值标签重读；色块本身走 CSS 变量级联
  const resolved = useThemeStore(s => s.resolved);
  const cs = getComputedStyle(document.documentElement);

  return (
    <>
      <DocHead
        title="Token 色板"
        en="theme/tokens.css · tokenContract.ts"
        duty={`全部语义色 token，值随 data-theme 级联（当前：${resolved}）。色芯按真实用法渲染——填色块、直接着色文字、放大线宽；半透明 token 叠在两色实体棋格上以显形。`}
        src="packages/ui/src/theme/tokens.css"
      />

      {GROUPS.map(group => (
        <section key={group.title}>
          <BlockTitle en={group.en}>{group.title}</BlockTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-4">
            {group.tokens.map(([name, cn, kind = "fill"]) => (
              <div key={name}>
                <Swatch name={name} kind={kind} />
                <div className="mt-1.5 min-w-0">
                  <div className="font-tau-mono text-tau-micro text-ink-1 break-all font-[550]">
                    {name}
                  </div>
                  <div className="font-tau-mono text-tau-tiny text-ink-3 mt-0.5 break-all">
                    {cs.getPropertyValue(`--tau-${name}`).trim()}
                  </div>
                  <div className="text-tau-tiny text-ink-2 mt-0.5">{cn}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <Note>focus-ring / overlay / shadow 属效果 token，见「尺度与动效」档案。</Note>
    </>
  );
}
