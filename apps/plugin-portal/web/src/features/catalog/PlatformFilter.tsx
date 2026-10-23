import { FilterPill } from "@tau/ui";
import {
  PLATFORM_LABELS,
  PORTABLE_PLATFORMS,
  type PlatformFilterValue,
  type PortablePlatform,
} from "./platforms";

/** 商店目标平台单选；只表示浏览该平台的声明，网页没有真实宿主，不判断当前设备能否安装。 */
export function PlatformFilter({
  value,
  counts,
  onChange,
}: {
  value: PlatformFilterValue;
  /** 各平台插件数；不传则不显示计数。 */
  counts?: Partial<Record<PlatformFilterValue, number>> | null;
  onChange: (value: PlatformFilterValue) => void;
}) {
  const options: { id: PlatformFilterValue; label: string }[] = [
    { id: "all", label: "全部平台" },
    ...PORTABLE_PLATFORMS.map((id: PortablePlatform) => ({ id, label: PLATFORM_LABELS[id] })),
  ];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div role="group" aria-label="目标平台" className="flex flex-wrap items-center gap-2">
        {options.map(option => (
          <FilterPill
            key={option.id}
            variant="raised"
            active={value === option.id}
            onClick={() => onChange(option.id)}
            label={option.label}
            count={counts?.[option.id]}
          />
        ))}
      </div>
      {value !== "all" && (
        <p className="text-tau-sm text-ink-3">
          仅显示声明支持{PLATFORM_LABELS[value]}的插件；能否装到你的设备，以 Tau
          应用内的插件中心为准。
        </p>
      )}
    </div>
  );
}
