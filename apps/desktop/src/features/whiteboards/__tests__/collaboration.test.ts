import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import {
  WhiteboardContractCatalog,
  prepareWhiteboardVersionUpgrade,
} from "@tau/whiteboard/collaboration";
import type { WhiteboardElementDefinition } from "@tau/whiteboard";
import { upgradableElementIds, whiteboardSyncStatus } from "../collaboration";

const docs: Y.Doc[] = [];
afterEach(() => docs.splice(0).forEach(doc => doc.destroy()));

it("只列出当前插件能直接转换的旧版本元素，缺失插件与当前版本元素保持原样", async () => {
  const old: WhiteboardElementDefinition = {
    type: "plugin.code",
    dataVersion: 1,
    collaboration: { textFields: ["source"] },
    render: () => null,
  };
  const catalog = await WhiteboardContractCatalog.prepare([
    {
      owner: "plugin",
      elements: [
        {
          ...old,
          dataVersion: 2,
          collaboration: { textFields: ["code"] },
          previousVersions: [{ element: old, access: "edit" }],
          migrations: [
            {
              from: 1,
              migrate: ({ source, ...rest }) => ({ ...rest, code: source }),
            },
          ],
        },
      ],
    },
  ]);
  const missing = await prepareWhiteboardContract("missing.plugin", {
    type: "missing.shape",
    dataVersion: 1,
  });
  const doc = new Y.Doc({ gc: false });
  docs.push(doc);
  const model = new WhiteboardModel(doc);
  await model.installContracts({ ...catalog.dictionary, [missing.id]: missing.contract });
  const [v1, v2] = Object.entries(catalog.dictionary)
    .sort(([, a], [, b]) => a.dataVersion - b.dataVersion)
    .map(([id]) => id);
  const geometry = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
  model.submit(
    [
      { type: "create_page", id: "page", title: "页" },
      ...(
        [
          { id: "old", contractId: v1, data: { source: "旧" } },
          { id: "new", contractId: v2, data: { code: "新" } },
          { id: "unknown", contractId: missing.id, data: { keep: 1 } },
        ] as { id: string; contractId: string; data: Record<string, string | number> }[]
      ).map(node => ({
        type: "create" as const,
        ...node,
        geometry,
        parent: { kind: "page" as const, id: "page" },
      })),
    ],
    null
  );
  const ids = upgradableElementIds(model, catalog);
  expect(ids).toEqual(["old"]);
  const bundle = prepareWhiteboardVersionUpgrade(model, "doc", catalog, ids);
  const nodes = bundle.pages[0].elements;
  expect(nodes.find(node => node.id === "old")?.data).toEqual({ code: "旧" });
  expect(nodes.find(node => node.id === "unknown")?.data).toEqual({ keep: 1 });
});

it("待续操作期间暂停编辑，被拒、结束与无权限分别给出可执行的下一步", () => {
  const saved = {
    phase: "saved",
    frozen: false,
    pending: 0,
    revision: 1,
    projectedRevision: 1,
  } as const;
  expect(whiteboardSyncStatus(saved, undefined, "upgrade").label).toContain("插件数据升级没有完成");
  expect(whiteboardSyncStatus(saved, { phase: "rejected", unsynced: true }).actions).toEqual([
    "rebuild",
  ]);
  expect(whiteboardSyncStatus(saved, { phase: "closed", unsynced: true }).actions).toEqual([
    "detach",
  ]);
  expect(whiteboardSyncStatus(saved, { phase: "forbidden", unsynced: true }).actions).toEqual([
    "retry",
    "detach",
  ]);
});
