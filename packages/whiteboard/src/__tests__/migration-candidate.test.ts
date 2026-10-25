import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import {
  WhiteboardModel,
  createWhiteboardBaseline,
  assertWhiteboardVersionUpgrade,
  exportWhiteboardTransfer,
} from "@tau/collaboration";
import { WhiteboardContractCatalog } from "../collaboration/catalog";
import { prepareWhiteboardVersionUpgrade } from "../collaboration/migration";
import type { WhiteboardElementDefinition } from "../extensions/api";
const docs: Y.Doc[] = [];
afterEach(() => docs.splice(0).forEach(doc => doc.destroy()));
it("source 到 code 整板换代保留隐藏页、外壳与未知属性，缺插件节点不被转换", async () => {
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
              migrate: input => {
                if (Object.hasOwn(input, "code")) throw new Error("目标已存在");
                const { source, ...rest } = input;
                return { ...rest, code: source };
              },
            },
          ],
        },
      ],
    },
  ]);
  const doc = new Y.Doc({ gc: false });
  docs.push(doc);
  const model = new WhiteboardModel(doc);
  await model.installContracts(catalog.dictionary);
  const source = Object.entries(catalog.dictionary).find(
    ([, contract]) => contract.dataVersion === 1
  )![0];
  model.submit(
    [
      { type: "create_page", id: "a", title: "显示" },
      { type: "create_page", id: "b", title: "隐藏" },
      {
        type: "create",
        id: "node",
        contractId: source,
        data: {
          source: "旧源码",
          unknown: { keep: true },
          id: "业务身份",
          type: "业务类型",
          geometry: "业务几何",
        },
        parent: { kind: "page", id: "b" },
        geometry: { x: 2, y: 3, width: 100, height: 50, rotation: 5 },
      },
    ],
    null
  );
  const before = exportWhiteboardTransfer(model, "doc");
  const converted = prepareWhiteboardVersionUpgrade(model, "doc", catalog, ["node"]);
  assertWhiteboardVersionUpgrade(before, converted);
  expect(converted.pages[1].elements[0].data).toEqual({
    code: "旧源码",
    unknown: { keep: true },
    id: "业务身份",
    type: "业务类型",
    geometry: "业务几何",
  });
  const candidate = await createWhiteboardBaseline(converted, {
    documentId: "doc",
    baselineId: "new",
    epoch: 1,
  });
  docs.push(candidate);
  const next = new WhiteboardModel(candidate);
  expect(next.read().pages[1].children[0].id).toBe("node");
  expect(next.read().pages[1].children[0].geometry).toEqual(
    model.read().pages[1].children[0].geometry
  );
  expect(next.read().pages[1].children[0].fieldBindings.data).toHaveProperty("code");
  expect(next.read().pages[1].children[0].fieldBindings.data).not.toHaveProperty("source");
  expect(model.read().pages[1].children[0].data.source).toBe("旧源码");
  const malicious = structuredClone(converted);
  malicious.pages[1].elements[0] = {
    ...malicious.pages[1].elements[0],
    geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
  };
  expect(() => assertWhiteboardVersionUpgrade(before, malicious)).toThrow("几何");
  expect(() => prepareWhiteboardVersionUpgrade(model, "doc", catalog, ["missing"])).toThrow(
    "已删除"
  );
  next.dispose();
  model.dispose();
});
