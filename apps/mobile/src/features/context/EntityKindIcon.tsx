import type { LucideIcon } from "lucide-react";

export function EntityKindIcon({
  svg,
  fallback: Fallback,
  size = 15,
  className,
}: {
  svg?: string | null;
  fallback: LucideIcon;
  size?: number;
  className?: string;
}) {
  if (!svg) return <Fallback size={size} className={className} aria-hidden />;
  const image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: "currentColor",
        maskImage: image,
        WebkitMaskImage: image,
        maskRepeat: "no-repeat",
        maskSize: "contain",
        maskPosition: "center",
      }}
    />
  );
}
