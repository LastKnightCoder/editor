import { invoke } from "@/electron";

export const analyzeOperations = async (params: {
  dates?: string[];
  startDate?: string;
  endDate?: string;
  contentType: string;
}): Promise<Record<string, any>> => {
  return invoke("analyze-operations", params);
};
