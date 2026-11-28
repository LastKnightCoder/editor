import { isElectron } from "@/electron";
import { encodeTauMarkdown, isTauMarkdown, tauMarkdownEquals } from "@tau/markdown";
import { desktopMarkdown } from "@/utils/markdown";
import { compileTauScopedPlan, decodeTauEditSource } from "./tau-scoped-plan";
import { getChatDatabase } from "@/services/chatDatabase";
import { getActiveEditingSessionByContentId } from "./active-editor-session";
import { applyEditOperations } from "./edit-engine";
import { loadSnapshotForContent, resolveContentTarget } from "./resolver";
import { getRangeByMatchId, getSnapshot } from "./snapshot-store";
import { compileScopedPlan, previewScopedPlan } from "./scoped-plan";
import { hashMarkdown } from "./snapshot";
import type { EditOperation } from "./types";

interface ContentEditRequest {
  databaseName?: string;
  signal?: AbortSignal;
  target?: { contentId?: number };
  baseHash?: string;
  snapshotId?: string;
  operations: EditOperation[];
  dryRun?: boolean;
}

export async function resolveEditRequest(params: ContentEditRequest) {
  const wholeDocument = params.operations.some(
    operation => operation.op !== "insert" && operation.locator.kind === "full-document"
  );
  if (wholeDocument && params.operations.length !== 1) throw new Error("全文替换必须单独提交");
  const scoped = isElectron && !wholeDocument;
  const match = params.operations.find(operation => operation.locator.kind === "match-id")?.locator;
  const snapshotId =
    params.snapshotId ??
    (match?.kind === "match-id" ? getRangeByMatchId(match.matchId)?.snapshotId : undefined);
  const captured = snapshotId ? getSnapshot(snapshotId) : null;
  const state = captured?.editState;
  const databaseName = (params.databaseName ?? getChatDatabase()).replace(/\.db$/, "");
  const resolvedTarget = await resolveContentTarget(
    {
      contentId:
        params.target?.contentId ??
        (state?.databaseName === databaseName ? state?.contentId : undefined),
    },
    params
  );
  return { resolvedTarget, captured, snapshotId, databaseName, wholeDocument, scoped };
}

export async function prepareEditRequest(
  params: ContentEditRequest,
  request: Awaited<ReturnType<typeof resolveEditRequest>>
) {
  const { resolvedTarget, captured, snapshotId, databaseName, wholeDocument, scoped } = request;
  const state = captured?.editState;
  if (
    isElectron &&
    !snapshotId &&
    (wholeDocument ||
      params.operations.some(
        operation =>
          operation.locator.kind === "markdown-range" ||
          operation.locator.kind === "slate-path" ||
          operation.locator.kind === "block-id"
      ))
  ) {
    return {
      success: false as const,
      errorCode: "SNAPSHOT_REQUIRED",
      message: "请先读取正文并传入 snapshotId",
    };
  }
  if (
    snapshotId &&
    ((!captured && (isElectron || params.dryRun)) ||
      (isElectron && !state) ||
      (state &&
        (state.contentId !== resolvedTarget.contentId || state.databaseName !== databaseName)))
  ) {
    return {
      success: false as const,
      errorCode: "SNAPSHOT_EXPIRED",
      message: "正文快照已失效，请重新读取",
    };
  }
  const { snapshot, source } =
    captured && (state || params.dryRun)
      ? { snapshot: captured, source: captured.source }
      : await (scoped
          ? loadSnapshotForContent(resolvedTarget.contentId, params, true)
          : loadSnapshotForContent(resolvedTarget.contentId, params));
  const selection = snapshot.editState
    ? (snapshot.editState.selection ?? null)
    : databaseName === getChatDatabase()
      ? getActiveEditingSessionByContentId(resolvedTarget.contentId)?.selection || null
      : null;

  if (params.baseHash && params.baseHash !== snapshot.hash) {
    return {
      success: false as const,
      errorCode: "CONTENT_CONFLICT",
      message: "内容已变化，请先刷新上下文后重试",
      currentHash: snapshot.hash,
      requestedHash: params.baseHash,
      snapshotId: snapshot.id,
    };
  }

  const editResult = applyEditOperations({
    snapshot,
    operations: params.operations,
    selection,
  });

  if (wholeDocument && snapshot.format === "tau-markdown/1") {
    const original = decodeTauEditSource(snapshot.markdown, false);
    if (editResult.markdown.trim()) {
      if (!isTauMarkdown(editResult.markdown))
        return {
          success: false as const,
          errorCode: "FORMAT_REQUIRED",
          message: "全文回写必须使用读取到的 Tau Markdown 协议，不能降级为普通 Markdown",
        };
      const parsed = decodeTauEditSource(editResult.markdown, false);
      if (!tauMarkdownEquals(parsed.metadata, original.metadata))
        return {
          success: false as const,
          errorCode: "IMMUTABLE_METADATA",
          message: "保留原有协议版本和文档契约元信息",
        };
    } else {
      editResult.markdown = encodeTauMarkdown([], {
        metadata: original.metadata,
        processor: desktopMarkdown,
      });
    }
  }
  const compiled =
    scoped && snapshot.editState
      ? snapshot.format === "tau-markdown/1"
        ? await compileTauScopedPlan(snapshot, editResult.patches, params.operations)
        : {
            plan: await compileScopedPlan(snapshot, editResult.patches, params.operations),
            patches: editResult.patches,
          }
      : undefined;
  const scopedPlan = compiled?.plan;
  if (compiled) editResult.patches = compiled.patches;
  if (scopedPlan && snapshot.editState) {
    editResult.markdown = await previewScopedPlan(
      snapshot.editState.state,
      scopedPlan,
      snapshot.format
    );
    editResult.hash = hashMarkdown(editResult.markdown);
  }
  return { success: true as const, snapshot, source, editResult, scopedPlan };
}
