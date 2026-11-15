import type { ContentSessionSnapshot } from "@tau/collaboration";
import type { DocumentDrain, DocumentDrainScope } from "../durable-document-lifecycle";

type Scope = Pick<DocumentDrainScope, "databaseName" | "windowId">;

export function matchesDocumentScope(scope: Scope, target: Scope): boolean {
  return (
    (scope.databaseName === undefined ||
      scope.databaseName.replace(/\.db$/, "") === target.databaseName?.replace(/\.db$/, "")) &&
    (scope.windowId === undefined || scope.windowId === target.windowId)
  );
}

interface Opening {
  connection: object;
  scope: Scope;
  contentId: number;
  task: Promise<ContentSessionSnapshot>;
}

export class ContentSessionLifecycle {
  private readonly openings = new Set<Opening>();
  private readonly drains = new Set<DocumentDrainScope>();

  assertOpen(scope: Scope): void {
    if ([...this.drains].some(drain => matchesDocumentScope(drain, scope)))
      throw new Error("正文正在保存并关闭，请稍后重试");
  }

  hasOpening(scope: Scope): boolean {
    return [...this.openings].some(opening => matchesDocumentScope(scope, opening.scope));
  }

  cancelOpening(scope: Scope): void {
    for (const opening of this.openings)
      if (matchesDocumentScope(scope, opening.scope)) this.openings.delete(opening);
  }

  async open(
    connection: object,
    scope: Scope,
    contentId: number,
    load: (check: () => void) => Promise<ContentSessionSnapshot>,
    continuation = false
  ): Promise<ContentSessionSnapshot> {
    this.assertOpen(scope);
    if (!continuation) {
      for (const opening of this.openings)
        if (
          opening.connection === connection &&
          opening.contentId === contentId &&
          opening.scope.windowId === scope.windowId
        )
          return opening.task;
    }
    const check = () => {
      if (!this.openings.has(opening)) throw new Error("正文打开已取消，请重新打开内容");
    };
    const task = Promise.resolve()
      .then(() => {
        check();
        return load(check);
      })
      .then(snapshot => {
        check();
        return snapshot;
      })
      .finally(() => this.openings.delete(opening));
    const opening = { connection, scope, contentId, task };
    this.openings.add(opening);
    return task;
  }

  async drain(scope: DocumentDrainScope, prepare: () => Promise<DocumentDrain>) {
    const gate = { ...scope };
    this.drains.add(gate);
    this.cancelOpening(gate);
    try {
      const drain = await prepare();
      let finished = false;
      const finish = (commit: boolean) => {
        if (finished) return;
        finished = true;
        try {
          if (commit) drain.commit();
          else drain.rollback();
        } finally {
          if (!commit || scope.reason !== "quit") this.drains.delete(gate);
        }
      };
      return { commit: () => finish(true), rollback: () => finish(false) };
    } catch (failure) {
      this.drains.delete(gate);
      throw failure;
    }
  }

  clear(): void {
    this.openings.clear();
    this.drains.clear();
  }
}
