import { getProjectItemsByContentId, isContentIsArticle, isContentIsCard } from "@/commands";

export interface AnswerContentStatus {
  contentId: number;
  isCard: boolean;
  isArticle: boolean;
  projectMountCount: number;
}

export const getAnswerContentStatus = async (contentId: number): Promise<AnswerContentStatus> => {
  const [isCard, isArticle, projectItems] = await Promise.all([
    isContentIsCard(contentId),
    isContentIsArticle(contentId),
    getProjectItemsByContentId(contentId),
  ]);

  return {
    contentId,
    isCard,
    isArticle,
    projectMountCount: projectItems.length,
  };
};

export const getAnswerPrimaryContentType = (status?: AnswerContentStatus | null): string => {
  if (!status) {
    return "custom";
  }
  if (status.isCard) {
    return "card";
  }
  if (status.isArticle) {
    return "article";
  }
  if (status.projectMountCount > 0) {
    return "project-item";
  }
  return "custom";
};

export const hasAnyAnswerProjection = (status?: AnswerContentStatus | null): boolean =>
  Boolean(status && (status.isCard || status.isArticle || status.projectMountCount > 0));
