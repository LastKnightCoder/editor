// @vitest-environment node
import { expect, it } from "vitest";
import { prepareDurableDocuments, registerDurableDocuments } from "../durable-document-lifecycle";

it("后台迁移先排空，再冻结正文和白板；失败逆序恢复", async () => {
  const events: string[] = [];
  const cleanup = [
    registerDurableDocuments({
      has: () => true,
      prepare: async () => {
        events.push("documents");
        return {
          commit() {},
          rollback() {
            events.push("resume-documents");
          },
        };
      },
    }),
    registerDurableDocuments({
      priority: -1,
      has: () => true,
      prepare: async () => {
        events.push("upgrade");
        return {
          commit() {},
          rollback() {
            events.push("resume-upgrade");
          },
        };
      },
    }),
  ];
  try {
    const drain = await prepareDurableDocuments({ reason: "database-change" });
    drain.rollback();
    expect(events).toEqual(["upgrade", "documents", "resume-documents", "resume-upgrade"]);
  } finally {
    cleanup.forEach(stop => stop());
  }
});
