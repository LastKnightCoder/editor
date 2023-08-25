import { EditingArticle } from "@/hooks/useEditArticleStore.ts";

export const isArticleChanged = (before: EditingArticle, after: EditingArticle) => {
  const {
    title: beforeTitle,
    content: beforeContent,
    tags: beforeTags,
    links: beforeLinks
  } = before;
  const {
    title: afterTitle,
    content: afterContent,
    tags: afterTags,
    links: afterLinks
  } = after;
  return (
    beforeTitle !== afterTitle ||
    JSON.stringify(beforeContent) !== JSON.stringify(afterContent) ||
    JSON.stringify(beforeTags) !== JSON.stringify(afterTags) ||
    JSON.stringify(beforeLinks) !== JSON.stringify(afterLinks)
  )
}