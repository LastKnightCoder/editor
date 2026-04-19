import {
  getDocumentItemsByContentId,
  getProjectItemsByContentId,
  isContentIsArticle,
  isContentIsCard,
} from "@/commands";

export interface AnswerContentStatus {
  contentId: number;
  isCard: boolean;
  isArticle: boolean;
  projectMountCount: number;
  documentMountCount: number;
}

export const getAnswerContentStatus = async (
  contentId: number,
): Promise<AnswerContentStatus> => {
  const [isCard, isArticle, projectItems, documentItems] = await Promise.all([
    isContentIsCard(contentId),
    isContentIsArticle(contentId),
    getProjectItemsByContentId(contentId),
    getDocumentItemsByContentId(contentId),
  ]);

  return {
    contentId,
    isCard,
    isArticle,
    projectMountCount: projectItems.length,
    documentMountCount: documentItems.length,
  };
};

export const getAnswerPrimaryContentType = (
  status?: AnswerContentStatus | null,
): string => {
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
  if (status.documentMountCount > 0) {
    return "document-item";
  }
  return "custom";
};

export const hasAnyAnswerProjection = (
  status?: AnswerContentStatus | null,
): boolean =>
  Boolean(
    status &&
    (status.isCard ||
      status.isArticle ||
      status.projectMountCount > 0 ||
      status.documentMountCount > 0),
  );
