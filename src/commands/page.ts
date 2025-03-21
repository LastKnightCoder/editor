import { invoke } from "@/electron";

export const openCardInNewWindow = (databaseName: string, cardId: number) => {
  return invoke("open-card-in-new-window", databaseName, cardId);
};
