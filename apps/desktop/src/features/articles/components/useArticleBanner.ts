import { useState } from "react";
import type { ArticlePageItem } from "@/types";

/** 可用的 banner 地址：加载失败过的不再用（记失败的 url 而非布尔，换封面后自动重试新图） */
export function useArticleBanner(article: ArticlePageItem): {
  banner: string;
  onBannerError(): void;
} {
  const [failedBanner, setFailedBanner] = useState<string>();
  const banner = article.bannerBg && article.bannerBg !== failedBanner ? article.bannerBg : "";
  return { banner, onBannerError: () => setFailedBanner(banner) };
}
