import { memo } from "react";

interface HeaderProps {
  totalSelected: number;
}

export const Header = memo<HeaderProps>(({ totalSelected }) => {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pb-2 pt-1">
      <div>
        <h3 className="text-tau-body text-ink-1 font-semibold">发布内容选择</h3>
        <p className="text-tau-tiny text-ink-3 mt-0.5">选择需要发布的卡片、文章、项目和知识库</p>
      </div>
      <div className="bg-group text-ink-2 rounded-full px-3 py-0.5 text-[11px] font-medium tabular-nums">
        已选 {totalSelected} 项
      </div>
    </header>
  );
});

Header.displayName = "Header";
