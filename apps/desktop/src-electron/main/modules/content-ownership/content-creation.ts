import type { ContentNode } from "@tau/collaboration";
import type { ICreateContent } from "@/types/content";

type ContentInput = Partial<Pick<ICreateContent, "content" | "contracts">>;
type PreparedBody = Pick<ICreateContent, "content" | "contracts">;

interface ContentCreationStore {
  transaction<T>(apply: () => T): T;
  insertContent(body: PreparedBody, refCount: 0 | 1): number;
  registerPendingRelease(contentId: number): void;
  notifyCreated(contentId: number): void;
}

export class ContentCreation {
  constructor(
    private readonly store: ContentCreationStore,
    private readonly newNodeId: () => string
  ) {}

  create(input: ContentInput): number {
    return this.createOwned(input, id => id);
  }

  createOwned<T>(input: ContentInput, insertOwner: (contentId: number) => T): T {
    return this.save(input, 1, insertOwner);
  }

  createPending(input: ContentInput): number {
    return this.save(input, 0, id => {
      this.store.registerPendingRelease(id);
      return id;
    });
  }

  private save<T>(input: ContentInput, refCount: 0 | 1, finish: (contentId: number) => T): T {
    const content = structuredClone(input.content ?? []);
    if (input.contracts) this.renewNodeIds(content as ContentNode[]);
    let id = 0;
    const result = this.store.transaction(() => {
      id = this.store.insertContent({ content, contracts: input.contracts }, refCount);
      // 原样返回，沿用 SQLite 事务对异步业务回调的拒绝。
      return finish(id);
    });
    this.store.notifyCreated(id);
    return result;
  }

  private renewNodeIds(nodes: ContentNode[]): void {
    for (const node of nodes) {
      if (!Array.isArray(node.children)) continue;
      node.collabId = this.newNodeId();
      this.renewNodeIds(node.children);
    }
  }
}
