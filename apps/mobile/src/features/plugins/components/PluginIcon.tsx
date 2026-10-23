import { cn } from "@tau/ui";
import { pluginTone } from "@tau/plugins/center";

const TONES = [
  "bg-tag-1-soft text-tag-1",
  "bg-tag-2-soft text-tag-2",
  "bg-tag-3-soft text-tag-3",
  "bg-tag-4-soft text-tag-4",
  "bg-tag-5-soft text-tag-5",
];
const SIZES = {
  md: "size-11 rounded-[13px] text-[17px]",
  xl: "size-[68px] rounded-[19px] text-[28px]",
};

/** manifest 尚无图标字段，使用名称首字；配色按 ID 稳定散列，与桌面端一致。 */
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
        "grid flex-none place-items-center font-extrabold",
        SIZES[size],
        TONES[pluginTone(id) - 1]
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
