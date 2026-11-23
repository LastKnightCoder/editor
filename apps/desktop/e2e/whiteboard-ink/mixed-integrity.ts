import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  WhiteboardElementSnapshot,
  WhiteboardModel,
  WhiteboardSnapshot,
} from "@tau/collaboration";
import type { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";
import { addMixedScene } from "../whiteboard-mixed-fixture";

export async function addIntegrityScene(
  model: WhiteboardModel,
  schema: Awaited<ReturnType<typeof prepareBuiltinWhiteboardTypes>>
) {
  await addMixedScene(model, schema);
  const frame = schema.types.frame.contractId;
  const geometry = { x: 20, y: 20, width: 1200, height: 350, rotation: 0 };
  const frameStyle = {
    backgroundColor: "#ffffff",
    borderColor: "#555555",
    borderWidth: 1,
    borderRadius: 4,
    borderStyle: "solid",
    titlePosition: "top",
    padding: 20,
    containmentPolicy: "partial",
    removalPolicy: "partial",
    autoResize: false,
    minWidth: 100,
    minHeight: 60,
  };
  model.submit(
    [
      { type: "create_page", id: "reference", title: "保留原样的第二页" },
      {
        type: "create",
        id: "reference-frame",
        parent: { kind: "page", id: "reference" },
        contractId: frame,
        geometry,
        data: { ...frameStyle, title: "第二页画框" },
      },
      {
        type: "create",
        id: "mixed-frame",
        parent: { kind: "page", id: "p" },
        contractId: frame,
        geometry,
        // 直接写入的画框可能只有标题，打开时应使用默认样式。
        data: { title: "混合内容" },
      },
      ...["shape-a-0", "text-0"].map(id => ({
        type: "move_node" as const,
        id,
        parent: { kind: "element" as const, id: "mixed-frame" },
      })),
    ],
    null,
    schema.prepared.filter(entry => entry.id === frame)
  );
}

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
}

function verifyPageProjection(record: Record<string, unknown>, node: WhiteboardElementSnapshot) {
  for (const [key, value] of Object.entries(node)) {
    if (key !== "children")
      assert.deepEqual(record[key], value, `持久化页面字段 ${node.id}.${key}`);
  }
  for (const [key, value] of Object.entries(node.geometry)) assert.equal(record[key], value);
  const children = record.children as Record<string, unknown>[];
  assert.equal(children.length, node.children.length);
  node.children.forEach((child, i) => verifyPageProjection(children[i], child));
}

export function verifyMixedDocument(
  directory: string,
  before: WhiteboardSnapshot,
  after: WhiteboardSnapshot,
  expected: InkPoint[][]
) {
  assert.deepEqual(
    after.pages.map(page => page.id),
    before.pages.map(page => page.id)
  );
  const original = before.pages.find(p => p.id === "p")!,
    page = after.pages.find(p => p.id === "p")!;
  const fresh = page.children.slice(original.children.length);
  assert.deepEqual({ ...after, pages: [] }, { ...before, pages: [] });
  assert.deepEqual(
    after.pages.find(p => p.id === "reference"),
    before.pages.find(p => p.id === "reference")
  );
  assert.deepEqual({ ...page, children: [] }, { ...original, children: [] });
  assert.equal(fresh.length, expected.length);
  original.children.forEach((node, i) =>
    assert.deepEqual(page.children[i], node, `历史元素 ${node.id}`)
  );
  fresh.forEach((stroke, index) => {
    const samples = stroke.children.flatMap(
      segment => segment.data.points as unknown as InkPoint[]
    );
    assert.equal(stroke.type, "handwrite");
    const input = expected[index];
    if (samples.length !== input.length) {
      const at = samples.findIndex(
        (point, i) =>
          !input[i] ||
          Math.abs(point.x - input[i].x) >= 0.001 ||
          Math.abs(point.y - input[i].y) >= 0.001 ||
          Math.abs(point.pressure - input[i].pressure) >= 0.001
      );
      const first = at < 0 ? samples.length : at;
      assert.fail(
        `笔 ${index} 点数 ${samples.length} / ${input.length}，首处差异 ${first}：落盘 ${JSON.stringify(samples.slice(first, first + 2))}，输入 ${JSON.stringify(input.slice(first, first + 2))}`
      );
    }
    samples.forEach((point, i) => {
      const target = expected[index][i];
      for (const key of ["x", "y", "pressure"] as const)
        assert.ok(
          Math.abs(point[key] - target[key]) < 0.001,
          `笔 ${index} 点 ${i} ${key}：${point[key]} / ${target[key]}`
        );
    });
  });
  const db = new DatabaseSync(join(directory, "home/.editor/data.db"), { readOnly: true });
  try {
    const row = db
      .prepare(
        "SELECT snapshot,state,revision_hash,revision FROM whiteboard_documents WHERE document_id=?"
      )
      .get("ink-bench")!;
    assert.deepEqual(JSON.parse(String(row.snapshot)), after);
    assert.equal(
      createHash("sha256")
        .update(row.state as Uint8Array)
        .digest("hex"),
      row.revision_hash
    );
    const rows = db
      .prepare(
        "SELECT p.page_id,c.data FROM whiteboard_document_pages p JOIN white_board_contents c ON c.id=p.content_id WHERE p.document_id=? AND p.visible=1 ORDER BY p.page_index"
      )
      .all("ink-bench");
    assert.equal(rows.length, after.pages.length);
    rows.forEach((r, i) => {
      const projected = JSON.parse(String(r.data)),
        page = after.pages[i];
      assert.equal(r.page_id, page.id);
      assert.equal(projected.revision, row.revision);
      assert.deepEqual(projected.recovery, page.recovery);
      assert.equal(projected.children.length, page.children.length);
      page.children.forEach((node, j) => verifyPageProjection(projected.children[j], node));
    });
    console.log(
      "MIXED_INTEGRITY",
      JSON.stringify({
        pages: after.pages.length,
        revision: row.revision,
        strokes: fresh.length,
        points: expected.reduce((n, stroke) => n + stroke.length, 0),
      })
    );
  } finally {
    db.close();
  }
}
