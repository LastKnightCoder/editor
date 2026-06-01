import useThemeColors from "@/hooks/useThemeColors";

export default function ListSkeleton() {
  const themeColors = useThemeColors();

  return (
    <div className="flex flex-col gap-2 px-2 pt-2">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-xl px-4 py-3.5"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div
            className={`h-4 w-4/5 rounded-md ${themeColors.tagBgClass} opacity-60`}
          />
          <div
            className={`mt-2.5 h-3 w-full rounded-md ${themeColors.tagBgClass} opacity-40`}
          />
          <div
            className={`mt-1.5 h-3 w-3/5 rounded-md ${themeColors.tagBgClass} opacity-40`}
          />
          <div className="mt-3 flex gap-2">
            <div
              className={`h-2.5 w-10 rounded-md ${themeColors.tagBgClass} opacity-30`}
            />
            <div
              className={`h-2.5 w-16 rounded-md ${themeColors.tagBgClass} opacity-30`}
            />
          </div>
          <div
            className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
            style={{ backgroundSize: "200% 100%" }}
          />
        </div>
      ))}
    </div>
  );
}
