import type { OutlineItem } from "./outline.ts";

interface DocsOutlineProps {
  items: OutlineItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

/** 最浅一级标题顶格，更深的逐级缩进 */
export function DocsOutline({ items, activeIndex, onSelect }: DocsOutlineProps) {
  const baseLevel = Math.min(...items.map(item => item.level));
  return (
    <nav aria-label="本页大纲" className="text-[13px]">
      <p className="text-ink-3 mb-2 text-[12px] font-medium tracking-[0.12em]">本页内容</p>
      <ul className="border-line-1 flex flex-col border-l">
        {items.map((item, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={index === activeIndex ? "location" : undefined}
              style={{ paddingLeft: `${12 + (item.level - baseLevel) * 12}px` }}
              className="text-ink-2 hover:text-ink-1 aria-[current=location]:border-accent aria-[current=location]:text-accent-text -ml-px block w-full border-l border-transparent py-1 pr-2 text-left leading-snug transition-colors"
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
