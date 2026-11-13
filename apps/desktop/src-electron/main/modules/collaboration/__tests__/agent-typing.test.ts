// @vitest-environment node
/** 直接改实时打字：逐段落地、整组撤销复原；有人进入这一块时停手，剩余文字接在已写部分之后。 */
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { expect, it } from "vitest";
import {
  buildScopedContentUpdate,
  captureScopedTextEdit,
  NodeTree,
  type ScopedContentResult,
  type ScopedContentSubmission,
} from "@tau/collaboration";
import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { typeEdit, typingChunks, type TypingHost } from "../../content-runtime/agent/agent-typing";

const ORIGINAL = "到 2025 年才支持整页离线编辑。";
const REPLACED = "在 2025 年 8 月推出离线模式，但需要逐页开启";

async function setup() {
  const doc = await createTestDocument(
    {
      title: "同步",
      bannerBg: "",
      bannerPosition: "center",
      content: [{ type: "paragraph", collabId: "p1", children: [{ text: ORIGINAL }] }],
    },
    { documentId: "doc", baselineId: "base", epoch: 1 }
  );
  const tree = new NodeTree(doc);
  const end = [..."到 2025 年才支持整页离线编辑"].length;
  const edit = captureScopedTextEdit(tree, "e", "p1", 0, end, REPLACED);
  const text = () =>
    tree
      .spans("p1")
      .map(span => span.value)
      .join("");
  const awareness = new Awareness(doc);
  awareness.setLocalState(null);
  const submit = async (request: ScopedContentSubmission): Promise<ScopedContentResult> => {
    const { update, inverse } = await buildScopedContentUpdate(doc, request.scope);
    Y.applyUpdate(doc, update);
    return { status: "committed", inverse };
  };
  return { doc, tree, edit, text, awareness, submit };
}

const base = { documentId: "doc", baselineId: "base", epoch: 1 };

it("逐段落地后与整条替换结果一致，整组逆操作一次撤销回原文", async () => {
  const { doc, tree, edit, text, awareness, submit } = await setup();
  const moves: string[] = [];
  const host: TypingHost = {
    local: true,
    session: () => ({ doc, awareness }),
    submit,
    moved: caret => moves.push(caret.position),
    delay: async () => undefined,
  };
  const outcome = await typeEdit(edit, base, {}, "s.0", host);
  expect(outcome.status).toBe("accepted");
  expect(text()).toBe(`${REPLACED}。`);
  expect(moves).toHaveLength(typingChunks(REPLACED).length);
  if (outcome.status !== "accepted") throw new Error("expected accepted");
  const undo = await buildScopedContentUpdate(doc, { edits: outcome.inverse });
  Y.applyUpdate(doc, undo.update);
  expect(text()).toBe(ORIGINAL);
  tree.dispose();
});

it("有人在这一块编辑时停手：已写的部分保留，剩余文字接在其后可继续提交", async () => {
  const { doc, tree, edit, text, awareness, submit } = await setup();
  let pieces = 0;
  const host: TypingHost = {
    local: true,
    session: () => ({ doc, awareness }),
    submit,
    moved: () => {
      // 写到第二段时用户把光标点进了这一段
      if (++pieces === 2)
        awareness.setLocalState({
          user: { id: "device", name: "我" },
          activity: "editing",
          nodeTreeSelection: {
            owner: "view",
            range: {
              rootId: tree.rootId,
              anchor: "",
              focus: Buffer.from(Y.encodeRelativePosition(tree.capturePosition("p1", 1))).toString(
                "base64"
              ),
            },
          },
        });
    },
    delay: async () => undefined,
  };
  const outcome = await typeEdit(edit, base, {}, "s.0", host);
  if (outcome.status !== "yielded" || !outcome.remainder) throw new Error("expected yielded");
  const chunks = typingChunks(REPLACED);
  expect(outcome.typed).toBe(chunks.slice(0, 2).join(""));
  expect(text()).toBe(`${outcome.typed}。`);
  expect(outcome.remainder.text).toBe(chunks.slice(2).join(""));
  const rest = await buildScopedContentUpdate(doc, { edits: [outcome.remainder.edit] });
  Y.applyUpdate(doc, rest.update);
  expect(text()).toBe(`${REPLACED}。`);
  tree.dispose();
});
