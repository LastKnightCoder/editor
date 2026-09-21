/**
 * 设置子页分节标题 —— 行流式子页的节头（界面 / 编辑器 两层语义分节）。
 */

export function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="pl-0.5">
      <div className="text-tau-tiny text-ink-3 pb-1 pt-[22px] font-semibold tracking-[0.04em]">
        {title}
      </div>
      {desc && <div className="text-tau-tiny text-ink-3/85 pb-1.5">{desc}</div>}
    </div>
  );
}
