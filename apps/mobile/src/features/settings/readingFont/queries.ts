import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchReadingFontCatalog, listInstalledReadingFonts } from "./api";

const READING_FONT_KEY = ["readingFont"] as const;

/** 线上可下载字体（大小、版本）；只在设置面板里用，失败不影响已安装字体 */
export function useReadingFontCatalog(enabled = true) {
  return useQuery({
    queryKey: [...READING_FONT_KEY, "catalog"],
    queryFn: fetchReadingFontCatalog,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    enabled,
  });
}

/** 本机已安装字体；壳层据此决定能否加载所选字体，下载/移除后失效重读 */
export function useInstalledReadingFonts() {
  return useQuery({
    queryKey: [...READING_FONT_KEY, "installed"],
    queryFn: listInstalledReadingFonts,
    staleTime: Infinity,
  });
}

export function useInvalidateInstalledReadingFonts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [...READING_FONT_KEY, "installed"] });
}
