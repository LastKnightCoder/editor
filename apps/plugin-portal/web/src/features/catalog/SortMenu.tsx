import { ArrowUpDown, ChevronDown } from "lucide-react";
import { Button, Menu } from "@tau/ui";
import type { CatalogSort } from "../../../../contracts";

export const SORT_LABELS: Record<CatalogSort, string> = {
  downloads7d: "最近热门",
  downloadsTotal: "下载最多",
  updated: "最近更新",
};

export function SortMenu({
  value,
  onChange,
}: {
  value: CatalogSort;
  onChange: (value: CatalogSort) => void;
}) {
  return (
    <Menu
      align="end"
      trigger={
        <Button aria-label={`排序：${SORT_LABELS[value]}`} icon={ArrowUpDown}>
          {SORT_LABELS[value]}
          <ChevronDown size={14} className="text-ink-3" />
        </Button>
      }
    >
      <Menu.RadioGroup value={value} onValueChange={next => onChange(next as CatalogSort)}>
        {(Object.keys(SORT_LABELS) as CatalogSort[]).map(sort => (
          <Menu.RadioItem key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </Menu>
  );
}
