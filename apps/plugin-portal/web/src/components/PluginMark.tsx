import { cn } from "@tau/ui";

const TONES = [
  "bg-tag-1-soft text-tag-1",
  "bg-tag-2-soft text-tag-2",
  "bg-tag-3-soft text-tag-3",
  "bg-tag-4-soft text-tag-4",
  "bg-tag-5-soft text-tag-5",
] as const;

const SIZES = {
  xs: "size-[22px] rounded-[6px] text-tau-micro",
  sm: "size-[30px] rounded-tau-sm text-tau-body",
  md: "size-10 rounded-[11px] text-[17px]",
  lg: "size-14 rounded-[15px] text-[24px]",
  xl: "size-[72px] rounded-[18px] text-[30px]",
} as const;

/** 同一插件 ID 恒定落在同一色相 */
function toneOf(pluginId: string) {
  let hash = 0;
  for (const char of pluginId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

/** 插件字标：包内没有图标资源，用名称首字 + 由 ID 决定的色相 */
export function PluginMark({
  pluginId,
  name,
  size = "md",
  className,
}: {
  pluginId: string;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 select-none place-items-center font-semibold",
        SIZES[size],
        toneOf(pluginId),
        className
      )}
    >
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}
