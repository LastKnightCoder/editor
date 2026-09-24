import { MOD } from "../../overlay";

export function KeyHints({ revealed }: { revealed: boolean }) {
  const items = revealed
    ? [
        ["1–4", "评分"],
        ["Space", "采用推荐"],
        [`${MOD}Z`, "撤销上一张"],
        ["E", "编辑"],
        ["Esc", "结束"],
      ]
    : [
        ["A–D", "选择"],
        ["↵", "提交"],
        ["Space", "显示答案"],
        ["S", "暂停本卡"],
        ["Esc", "结束"],
      ];
  return (
    <div className="text-ink-3 mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
      {items.map(([k, label]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <kbd className="bg-hover text-ink-2 rounded-[4px] px-1 font-mono text-[10.5px] leading-4">
            {k}
          </kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
