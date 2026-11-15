import type { Descendant } from "slate";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";

export interface ContentReplacementInput {
  content: Descendant[];
  contracts?: ContentContractDictionary;
  expectedRevision?: string;
  count?: number;
}

type OpenContent =
  | { kind: "current"; replace?: (value: ContentReplacementInput) => Promise<void> }
  | { kind: "unsupported" };

interface ContentReplacementStore {
  openContent(contentId: number): OpenContent | undefined;
  transaction<T>(apply: () => T): T;
  writeCold(contentId: number, value: ContentReplacementInput): void;
  notifyColdWrite(contentId: number): void;
}

export class ContentReplacement {
  constructor(private readonly store: ContentReplacementStore) {}

  replace(contentId: number, value: ContentReplacementInput): void | Promise<void> {
    const open = this.store.openContent(contentId);
    if (open?.kind === "current") {
      if (!open.replace) throw new Error("正文写入服务尚未就绪");
      return open.replace(value);
    }
    this.replaceCold(contentId, value);
  }

  replaceCold(contentId: number, value: ContentReplacementInput): void {
    this.store.transaction(() => {
      if (this.store.openContent(contentId))
        throw new Error("CONTENT_VERSION_CONFLICT: 活跃正文必须通过带修订的文档写入入口修改");
      this.store.writeCold(contentId, value);
    });
    this.store.notifyColdWrite(contentId);
  }
}
