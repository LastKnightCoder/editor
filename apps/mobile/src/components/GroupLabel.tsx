import type { ReactNode } from "react";

/* 分组标签：卡片列表上方的小标题（设置页、协作中心、协作成员表共用）。

   横向基准：标签文字与所属卡片「行文字」的左边缘对齐 —— 容器内边距 + 卡片边框 + 行内边距
   就是标签自身该补的内边距，所以按容器模型取 inset 变体：
   - settings：滚动容器 px-4 + .setting-group 1px 边框 + .setting-row 14px → 自身 15px
   - page：协作中心页卡片自带 mx-4 且无边框、行内 px-4 → 自身 32px
   - sheet：浮层滚动容器 px-1 + 行内 14px（成员行已补同一内边距）→ 自身 14px
   项目没有 tailwind-merge，className 覆盖同类 utility 的胜负由产物顺序决定、不可靠，
   所以缩进走 inset 变体而不是 className 覆盖；className 只用来传不冲突的排版差异（字重等）。

   纵向基准：上 16px / 下 7px，与设计稿 group-label + group-card 的 16/7 一致。
   上间距写在自身的 mt-4 上而不是靠外层——外层用 .space-y-1 时，Tailwind v4 生成的是
   :where(.space-y-1 > :not(:last-child)) { margin-block-end }，那 4px 落在每个块的下方，
   靠外层补上间距会让标签贴住上一张卡片；mt-4 与外层的 4px 相邻折叠后取 16px，卡片自带
   mb-4 的容器（如协作中心页）同样折叠成 16px，两边都成立。页面首个标签没有前驱块，用
   first: 收回到 4px，保持贴顶。 */
const LABEL_INSET = {
  settings: "px-[15px]",
  page: "px-8",
  sheet: "px-3.5",
} as const;

const LABEL_TONE = {
  ink: "text-ink-2",
  warn: "text-warn",
} as const;

export function GroupLabel(props: {
  children: ReactNode;
  tone?: keyof typeof LABEL_TONE;
  inset?: keyof typeof LABEL_INSET;
  className?: string;
}) {
  return (
    <p
      className={`${LABEL_TONE[props.tone ?? "ink"]} ${LABEL_INSET[props.inset ?? "settings"]} text-tau-sm mt-4 mb-[7px] leading-relaxed first:mt-1 ${props.className ?? ""}`}
    >
      {props.children}
    </p>
  );
}
