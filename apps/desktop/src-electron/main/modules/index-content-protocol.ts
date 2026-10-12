import type { ContentSection } from "@/entity/sections";

export interface IndexContentInput {
  raw: string;
  title: string;
  whole: boolean;
  sections: boolean;
}

export interface IndexContentResult {
  content: string;
  sections?: ContentSection[];
}

export type IndexContentReply =
  { ok: true; result: IndexContentResult } | { ok: false; message: string };
