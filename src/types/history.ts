import {ICard} from "@/types/card.ts";

export interface History {
  id: number;
  content: string;
  content_id: number;
  content_type: string;
  create_time: string;
}

export type CardHistory = Exclude<History, 'content'> & { content: ICard }
