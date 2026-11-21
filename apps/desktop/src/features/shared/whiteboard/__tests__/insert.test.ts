import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhiteboardSession, type DocumentElement } from "@tau/whiteboard";
import { createDocumentExtension, createInteractionExtension } from "@tau/whiteboard/extensions";
import { insertDocuments, toInsertTarget } from "../components/Document/insert";

vi.mock("@tau/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/ui")>()),
  toast: { info: vi.fn(), error: vi.fn() },
}));

const sessions: ReturnType<typeof createWhiteboardSession>[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.dispose()));

function sessionWith(children: DocumentElement[] = []) {
  const session = createWhiteboardSession(
    {
      children,
      viewPort: { minX: 0, minY: 0, width: 1200, height: 800, zoom: 1 },
      selection: { selectArea: null, selectedElements: [] },
      version: 2,
    },
    [createDocumentExtension({}), createInteractionExtension()]
  );
  sessions.push(session);
  return session;
}
const boardWith = (children?: DocumentElement[]) => sessionWith(children).api;

const moment = (id: number) => toInsertTarget({ kind: "diary-moment", id, title: `日记 ${id}` })!;
const documents = (api: ReturnType<typeof boardWith>) =>
  api.children.filter((element): element is DocumentElement => element.type === "document");

describe("放入文档", () => {
  it("同一天两条日记分别保存片段身份，不保存 segmentId 或 contentId", async () => {
    const api = boardWith();
    await insertDocuments(api, [moment(11), moment(12)], { at: { x: 0, y: 0 } });
    const placed = documents(api);
    expect(placed.map(element => element.entityRef)).toEqual([
      { kind: "diary-moment", id: 11 },
      { kind: "diary-moment", id: 12 },
    ]);
    for (const element of placed) {
      expect(element).not.toHaveProperty("segmentId");
      expect(element).not.toHaveProperty("contentId");
    }
  });

  it("白板已不可提交时不写入", async () => {
    const session = sessionWith();
    session.setActive(false);
    await insertDocuments(session.api, [moment(12)], { at: { x: 0, y: 0 } });
    expect(documents(session.api)).toHaveLength(0);
  });

  it("单篇已在板上时不重复放入，改为选中那张", async () => {
    const existing: DocumentElement = {
      id: "doc",
      type: "document",
      entityRef: { kind: "diary-moment", id: 12 },
      x: 0,
      y: 0,
      width: 260,
      height: 240,
    };
    const api = boardWith([existing]);
    await insertDocuments(api, [moment(12)], { at: { x: 500, y: 0 } });
    expect(documents(api)).toHaveLength(1);
    expect(api.selection.selectedElements.map(element => element.id)).toEqual(["doc"]);
  });

  it("从卡片拖出的放入连一条两端绑定的箭头，与新卡一起选中后可一步撤销", async () => {
    const source: DocumentElement = {
      id: "src",
      type: "document",
      entityRef: { kind: "card", id: 1 },
      x: 0,
      y: 0,
      width: 260,
      height: 240,
    };
    const api = boardWith([source]);
    const [placed] = await insertDocuments(api, [moment(12)], {
      at: { x: 600, y: 120 },
      linkFrom: "src",
    });
    const arrow = api.children.find(element => element.type === "arrow");
    expect(arrow).toMatchObject({ source: { bindId: "src" }, target: { bindId: placed.id } });
    expect(api.selection.selectedElements.map(element => element.id)).toEqual([placed.id]);
    await api.execute("tau.history.undo");
    expect(api.children.map(element => element.id)).toEqual(["src"]);
  });
});
