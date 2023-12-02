import { getDocumentItem } from "@/commands";

export const getItems = async (ids: number[]) => {
  return await Promise.all(ids.map(id => getDocumentItem(id)));
}