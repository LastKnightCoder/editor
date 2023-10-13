import { EditingArticle } from "@/stores/useEditArticleStore.ts";

export const isArticleChanged = (before: EditingArticle, after: EditingArticle) => {
  const {
    title: beforeTitle,
    content: beforeContent,
    tags: beforeTags,
    links: beforeLinks,
    bannerBg: beforeBannerBg,
  } = before;
  const {
    title: afterTitle,
    content: afterContent,
    tags: afterTags,
    links: afterLinks,
    bannerBg: afterBannerBg,
  } = after;
  return (
    beforeTitle !== afterTitle ||
    beforeBannerBg !== afterBannerBg ||
    JSON.stringify(beforeContent) !== JSON.stringify(afterContent) ||
    JSON.stringify(beforeTags) !== JSON.stringify(afterTags) ||
    JSON.stringify(beforeLinks) !== JSON.stringify(afterLinks)
  )
}