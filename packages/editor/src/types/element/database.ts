import { Descendant } from "slate";

export interface DatabaseElement {
  type: "database";
  id: string;
  tableId: number;
  height: number;
  children: Descendant[];
}
