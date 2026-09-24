import { invoke } from "@/electron";
import { IArticle, ICard, ProjectItem, Operation } from "@/types";

export const getLatestOperations = async (
  number: number
): Promise<{
  cards: ICard[];
  articles: IArticle[];
  projectItems: ProjectItem[];
}> => {
  return invoke("get-latest-operations", number);
};

export const getOperationsByDates = async (
  dates: string[],
  contentType: string
): Promise<Record<string, Operation[]>> => {
  return invoke("get-operations-by-dates", dates, contentType);
};

export const getOperationsByDateRange = async (
  startDate: string,
  endDate: string,
  contentType: string
): Promise<Record<string, Operation[]>> => {
  return invoke("get-operations-by-date-range", startDate, endDate, contentType);
};

export const analyzeOperations = async (params: {
  dates?: string[];
  startDate?: string;
  endDate?: string;
  contentType: string;
}): Promise<Record<string, any>> => {
  return invoke("analyze-operations", params);
};
