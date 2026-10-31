import type { FuseIndex, FuseOptionKey } from "fuse.js";

export interface DocSearchDocument {
  href: string;
  title: string;
  section: string;
  group: string;
  summary: string;
  content: string;
}

export interface DocSearchPayload {
  version: 1;
  basePath: string;
  documents: DocSearchDocument[];
  index: ReturnType<FuseIndex<DocSearchDocument>["toJSON"]>;
}

export const DOC_SEARCH_KEYS: FuseOptionKey<DocSearchDocument>[] = [
  { name: "title", weight: 3 },
  { name: "section", weight: 2 },
  { name: "summary", weight: 1 },
  { name: "content", weight: 1 },
];
