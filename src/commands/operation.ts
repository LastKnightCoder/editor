import { invoke } from "@/electron";
import { IArticle, ICard, IDocumentItem, ProjectItem } from "@/types";

export const getLatestOperations = async (
  number: number,
): Promise<{
  cards: ICard[];
  articles: IArticle[];
  projectItems: ProjectItem[];
  documentItems: IDocumentItem[];
}> => {
  return invoke("get-latest-operations", number);
};
