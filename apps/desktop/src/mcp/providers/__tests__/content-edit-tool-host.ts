import Database from "better-sqlite3";
import * as Y from "yjs";
import { expect, type Mock } from "vitest";
import { createEditor, type Descendant, type Editor } from "slate";
import { createEditorKit } from "@tau/editor";
import { tableExtensions } from "@tau/editor/extensions/table";
import { withNodeTree } from "@tau/editor-collab";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { NodeTree, validateNodeDocument, type ContentNode } from "@tau/collaboration";
import { prepareContentContracts } from "@/services/editorKit";
import { setChatDatabase } from "@/services/chatDatabase";
import { contentEditToolsProvider } from "../content-edit-tools";
import { unregisterContentSession } from "../../../../src-electron/main/modules/collaboration/content-sessions";
import { setup } from "../../../../src-electron/main/modules/collaboration/__tests__/manager-node-document.helpers";
import { ContentDocumentTable } from "../../../../src-electron/main/modules/tables/content-document";
import { registerAgentEditExecution } from "../../../../src-electron/main/modules/agent-run-events";
import { createContentAgentCommands } from "../../../../src-electron/main/modules/content-runtime/agent/commands";
import { must } from "../../../../src-electron/main/test-support";
export async function openContentToolHost(
  nodes: Descendant[],
  ipc: Mock,
  sourceContracts: ContentContractDictionary = {},
  realtime = false
) {
  const catalog = await prepareContentContracts();
  const prepared = await catalog.createDocument(nodes, sourceContracts);
  const fixture = await setup(realtime, undefined, {
    documentId: "table-deletion",
    content: prepared.content as ContentNode[],
    contracts: prepared.contracts,
  });
  setChatDatabase("library");
  const agent = fixture.local.agent;
  const handlers = createContentAgentCommands(() => agent);
  const cache = new Map<string, unknown>();
  const readCurrent = async () => {
    const state = await agent.readEditSnapshot(fixture.db, 7);
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, state.state);
      const tree = new NodeTree(doc);
      try {
        const row = fixture.db
          .prepare(
            "SELECT id,create_time,update_time,count,ref_count FROM content_snapshots WHERE id=7"
          )
          .get();
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("正文行不存在");
        return {
          ...row,
          content: state.content,
          contracts: tree.contracts.toJSON(),
          revision: state.revision,
        };
      } finally {
        tree.dispose();
      }
    } finally {
      doc.destroy();
    }
  };
  ipc.mockImplementation(async (channel: keyof typeof handlers, ...args: unknown[]) => {
    if (String(channel) === "module-init:init-module") return { success: true };
    if (String(channel) === "write-cache-file") {
      cache.set(String(args[0]), structuredClone(args[1]));
      return;
    }
    if (String(channel) === "read-cache-file")
      return structuredClone(cache.get(String(args[0])) ?? null);
    if (String(channel) === "content:get-by-id") return readCurrent();
    if (String(channel) === "content:update") {
      const payload = args[1] as {
        content: ContentNode[];
        contracts?: ContentContractDictionary;
        expectedRevision?: string;
      };
      const state = await agent.readEditSnapshot(fixture.db, 7);
      const target =
        fixture.localSessions.get(state.identity.documentId) ??
        fixture.runtime.content.sessions.get(state.identity.documentId);
      if (!target?.replaceContent) throw new Error("正文替换会话不可用");
      await target.replaceContent(payload.content, payload.contracts, payload.expectedRevision);
      return readCurrent();
    }
    if (!handlers[channel]) throw new Error("未知 IPC " + channel);
    return Reflect.apply(handlers[channel], undefined, [fixture.db, ...args.slice(0, -1)]);
  });
  agent.permissions.set(fixture.db, 7, "助手", "direct");
  const tools = contentEditToolsProvider.tools();
  const executions = new Map([["table-edits", registerAgentEditExecution("table-edits")]]);
  const stop = () => {
    for (const dispose of executions.values()) dispose();
    executions.clear();
  };
  const run = async (
    name: string,
    args: Record<string, unknown>,
    databaseName = "library",
    actor?: string
  ) => {
    const executionId = actor ? "table-edits-" + actor : "table-edits";
    if (!executions.has(executionId)) {
      executions.set(executionId, registerAgentEditExecution(executionId));
      agent.permissions.set(fixture.db, 7, actor ?? "助手", "direct");
    }
    const tool = must(
      tools.find(tool => tool.name === name),
      name
    );
    const reply = await tool.executor(args, {
      toolCallId: "fixture",
      toolName: name,
      source: "test",
      databaseName,
      ...(actor ? { conversationKey: "table-release:subagent:" + actor } : {}),
      toolContext: { executionId, ...(actor ? { agentTitle: actor } : {}) },
    });
    if (!reply || typeof reply === "string") throw new Error("工具缺少回执");
    return JSON.parse(reply.content);
  };
  const current = async () => (await agent.readEditSnapshot(fixture.db, 7)).content;
  const find = async (queryText: string, occurrence = 1) => {
    const result = await run("find_content_ranges", {
      target: { contentId: 7 },
      queryText,
      occurrence,
    });
    expect(result.candidates, JSON.stringify(result)).toHaveLength(1);
    return {
      snapshotId: result.snapshotId,
      operations: [
        { op: "delete", locator: { kind: "match-id", matchId: result.candidates[0].matchId } },
      ],
    };
  };
  const session = () => must(fixture.localSessions.get(fixture.localId), "正文会话");
  const flush = () => fixture.local.project(session());
  const reopen = async () => {
    await flush();
    const old = session();
    unregisterContentSession(old);
    old.awareness.destroy();
    old.doc.destroy();
    fixture.localSessions.delete(fixture.localId);
    await fixture.local.open(fixture.event, { contentId: 7 });
    await validateNodeDocument(session().doc);
  };
  const diskContent = () => {
    const disk = new Database(fixture.db.name, { readonly: true });
    try {
      return ContentDocumentTable.read(disk, 7)?.content;
    } finally {
      disk.close();
    }
  };
  const userTypes = async (blockId: string, text: string) => {
    const peer = new Y.Doc({ gc: false });
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(session().doc));
    const vector = Y.encodeStateVector(peer);
    const tree = new NodeTree(peer);
    try {
      tree.insertText(blockId, 0, text, {}, tree.spans(blockId)[0]?.attributes);
      await fixture.local.acceptUpdates(
        session(),
        Y.encodeStateAsUpdate(peer, vector),
        () => undefined
      );
    } finally {
      tree.dispose();
      peer.destroy();
    }
  };
  const prepareHumanEdit = async (edit: (editor: Editor) => void) => {
    const state = await agent.readEditSnapshot(fixture.db, 7);
    const peer = new Y.Doc({ gc: false });
    Y.applyUpdate(peer, state.state);
    const tree = new NodeTree(peer);
    const base = createEditorKit({ extensions: tableExtensions }).assembly.plugins.reduce(
      (editor, plugin) => plugin(editor),
      createEditor()
    );
    const editor = withNodeTree(
      base,
      tree,
      {},
      {
        currentContract: type => catalog.current(type)?.id,
        normalizeOnConnect: false,
      }
    );
    try {
      editor.connectNodeTree();
      const vector = Y.encodeStateVector(peer);
      edit(editor);
      editor.flushNodeTreeInputs();
      await validateNodeDocument(peer);
      const update = Y.encodeStateAsUpdate(peer, vector);
      return {
        content: tree.read(),
        update,
        commit: () => fixture.local.acceptUpdates(session(), update, () => undefined),
      };
    } finally {
      editor.disposeNodeTree();
      tree.dispose();
      peer.destroy();
    }
  };
  const blockSource = async (node: ContentNode) => {
    const result = await run("get_content_markdown", {
      contentId: 7,
      blockId: String(node.collabId),
    });
    if (typeof result.markdown !== "string") throw new Error("原生块读取失败");
    return result.markdown;
  };
  return {
    fixture,
    run,
    find,
    current,
    stop,
    agent,
    reopen,
    flush,
    diskContent,
    userTypes,
    blockSource,
    prepareHumanEdit,
  };
}
