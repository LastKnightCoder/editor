// @vitest-environment node
/** Agent 在场的生命周期：按发起对话清理，子 Agent 与主对话互不影响，离开时广播撤下光标。 */
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate } from "y-protocols/awareness";
import { afterEach, expect, it } from "vitest";
import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { captureScopedTextEdit, NodeTree } from "@tau/collaboration";
import { emitAgentRunEnded } from "../../agent-run-events";
import { AgentPresenceHub } from "../agent-presence";

const MAIN = "library\u0000main-chat:c1";
let hub: AgentPresenceHub;
afterEach(() => hub?.dispose());

it("主对话与子 Agent 各自按一轮结束清除，视图收到光标与离开", async () => {
  const doc = await createTestDocument(
    {
      title: "同步",
      bannerBg: "",
      bannerPosition: "center",
      content: [{ type: "paragraph", collabId: "p1", children: [{ text: "任何顺序合并" }] }],
    },
    { documentId: "doc", baselineId: "base", epoch: 1 }
  );
  const view = new Awareness(new Y.Doc());
  view.setLocalState(null);
  const changed: string[] = [];
  hub = new AgentPresenceHub({
    doc: () => ({ documentId: "room", doc }),
    broadcastAwareness: (_documentId, update) => applyAwarenessUpdate(view, update, "main"),
    changed: (workspaceId, contentId) => changed.push(`${workspaceId}:${contentId}`),
  });
  const tree = new NodeTree(doc);
  const edit = captureScopedTextEdit(tree, "e", "p1", 0, 4, "以任意顺序");
  tree.dispose();

  hub.set("library", 7, {
    agent: "调研员",
    owner: `${MAIN}:subagent:a1`,
    status: "busy",
    action: "正在读正文",
    block: "p1",
  });
  hub.set("library", 7, {
    agent: "助手",
    owner: MAIN,
    status: "waiting",
    action: "等你处理 1 条建议",
    caret: { blockId: "p1", position: edit.end },
  });
  expect(hub.list("library", 7).map(item => [item.agent, item.status])).toEqual([
    ["调研员", "busy"],
    ["助手", "waiting"],
  ]);
  const states = () =>
    [...view.getStates().values()].map(state => [
      state.user?.name,
      Boolean(state.nodeTreeSelection),
    ]);
  expect(states()).toEqual([
    ["调研员", false],
    ["助手", true],
  ]);

  emitAgentRunEnded("subagent:a1");
  expect(hub.list("library", 7).map(item => item.agent)).toEqual(["助手"]);
  expect(states()).toEqual([["助手", true]]);

  emitAgentRunEnded(MAIN);
  expect(hub.list("library", 7)).toEqual([]);
  expect(view.getStates().size).toBe(0);
  expect(changed.at(-1)).toBe("library:7");
  view.destroy();
});
