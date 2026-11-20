import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import {
  NodeTree,
  readNodeDocument,
  validateNodeDocument,
  type ContentNode,
} from "@tau/collaboration";
import { applyNodeTreeContent } from "@tau/editor-collab";
import {
  canonicalContractJson,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import databaseModule from "../database";
import { contentRevision } from "../collaboration/content-sessions";
import type { RuntimeSession } from "../collaboration/types";
import type { ContentSessionRuntime } from "./index";

export async function replaceContentSnapshot(
  runtime: ContentSessionRuntime,
  session: RuntimeSession,
  content: ContentNode[],
  supplied: ContentContractDictionary | undefined,
  expectedRevision: string | undefined,
  checkScope?: () => void,
  onAccepted?: () => void
): Promise<void> {
  const source = session.info.source;
  const database = source && databaseModule.getDatabase(source.databaseName);
  const checkSession = () => {
    checkScope?.();
    if (
      source &&
      (session.info.source !== source ||
        !database?.open ||
        databaseModule.getDatabase(source.databaseName) !== database)
    )
      throw new Error("资料库连接已变化，请重新读取正文");
    if (
      session.info.frozen ||
      session.info.leaving ||
      session.info.status !== "active" ||
      runtime.sessions.get(session.info.id) !== session
    )
      throw new Error("正文会话已变化，请重新读取");
  };
  if (!expectedRevision) throw new Error("CONTENT_VERSION_CONFLICT: 正文缺少观察修订，请重新读取");
  const checkRevision = () => {
    checkSession();
    if (contentRevision(session) !== expectedRevision)
      throw new Error("CONTENT_VERSION_CONFLICT: 正文已变化，请保留待应用结果后重试");
  };
  const shared = session.info.mode === "local" ? undefined : runtime.sharedEffects;
  if (!shared && session.info.mode !== "local")
    throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
  const intentHash = shared
    ? createHash("sha256")
        .update(canonicalContractJson([expectedRevision, content, supplied ?? null]))
        .digest("hex")
    : "";
  checkSession();
  if (shared && (await shared.retryReplacement(session, intentHash, checkSession, onAccepted))) {
    await runtime.project(session);
    return;
  }
  checkRevision();
  const candidate = new Y.Doc({ gc: false });
  Y.applyUpdate(candidate, Y.encodeStateAsUpdate(session.doc));
  const vector = Y.encodeStateVector(candidate),
    tree = new NodeTree(candidate);
  try {
    await tree.installContracts(supplied ?? {}, null);
    const contracts = tree.contracts.toJSON() as ContentContractDictionary;
    const value = { ...readNodeDocument(candidate), content };
    const mapped =
      session.info.mode === "local"
        ? await runtime.assets.prepareLocalDocument(session.info.id, value, contracts)
        : await runtime.assets.shareDocument(
            session.info.serverUrl,
            session.info.id,
            session.info.id,
            value,
            contracts
          );
    checkRevision();
    applyNodeTreeContent(tree, mapped.content, {});
    const meta = session.doc.getMap("meta"),
      identity = {
        documentId: session.info.id,
        baselineId: String(meta.get("baselineId")),
        epoch: Number(meta.get("epoch")),
      };
    await validateNodeDocument(candidate, identity, session.doc, {
      allowLocalResources: session.info.mode === "local",
    });
    checkRevision();
    const update = Y.encodeStateAsUpdate(candidate, vector),
      operationId = randomUUID(),
      candidateState = Y.encodeStateAsUpdate(candidate);
    if (shared) {
      await shared.submitReplacement(
        session,
        {
          operationId,
          intentHash,
          expectedRevision,
          update,
          candidateState,
          retainCandidate: () => runtime.retainNodeState(session, candidate),
        },
        checkRevision,
        checkSession,
        onAccepted
      );
      await runtime.project(session);
      return;
    }
    runtime.contentState.saveDocumentDraft(
      { workspaceId: session.info.source?.databaseName ?? "application", ...identity },
      `operation:${operationId}`,
      { state: candidateState, sequence: 1 }
    );
    runtime.retainNodeState(session, candidate);
    await runtime.contentUpdates().apply(
      session,
      update,
      () => {
        if (
          runtime.sessions.get(session.info.id) !== session ||
          session.doc.getMap("meta").get("baselineId") !== identity.baselineId
        )
          throw new Error("正文会话已变化，待应用结果已保留");
        checkRevision();
      },
      onAccepted
    );
    await runtime.project(session);
  } finally {
    tree.dispose();
    candidate.destroy();
  }
}
