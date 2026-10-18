import { cn } from "@tau/ui";
import { pluginTone } from "../model";

const TONES = [
  "bg-tag-1-soft text-tag-1",
  "bg-tag-2-soft text-tag-2",
  "bg-tag-3-soft text-tag-3",
  "bg-tag-4-soft text-tag-4",
  "bg-tag-5-soft text-tag-5",
];
const SIZES = {
  sm: "size-8 rounded-[9px] text-[13.5px]",
  md: "size-10 rounded-[11px] text-[16px]",
  lg: "size-[60px] rounded-[16px] text-[24px]",
};

/** manifest 尚无图标字段，使用名称首字。 */
export function PluginIcon({
  id,
  name,
  size = "md",
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center font-semibold",
        SIZES[size],
        TONES[pluginTone(id) - 1]
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
