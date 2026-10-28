import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, type EditorDocument, type EditorKit, type EditorRef } from "@tau/editor";
import type { Descendant } from "slate";
import type { NodeTreeEditor } from "@tau/editor-collab";
import { ErrorBoundary } from "@tau/ui";
import type { ContentEditorProps, ContentPreviewProps } from "@tau/plugins/components";
import type { MobileDataAdapter } from "./data";
import type { ContentDetailResponse } from "../../types";
import { useEditContent } from "../../hooks/useEditContent";
import useLocalContentDocument, {
  type LocalContentDocument,
} from "../../hooks/useLocalContentDocument";
import { useMobileContentKit } from "../../services/editorKit";
import { useCollabSession } from "../../features/collaboration/hooks/useCollabSession";
import { useCollaborationRuntime } from "../../features/collaboration/hooks/useCollaborationRuntime";
import { collaborationManager } from "../../features/collaboration/core/manager";
import {
  MobileEditorBottomToolbar,
  type AccessoryItemId,
} from "../../features/cards/editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "../../features/cards/editorToolbar/useMobileEditorToolbarController";
import ContentLinkPickerSheet from "../../features/cards/editorExtensions/ContentLinkPickerSheet";
import {
  useContentMention,
  type ContentMentionRequest,
} from "../../features/cards/editorExtensions/useContentMention";
import { ContentAccessNotice, usePluginContentAccess } from "./content-components-access";
import { usePluginContentLocation } from "./content-components-location";

const COMPACT_BUTTONS = new Set<AccessoryItemId>([
  "context-media",
  "context-table",
  "context-code",
  "context-math",
  "context-source-block",
  "plus",
  "style",
  "check-list",
  "bulleted-list",
  "outdent",
  "indent",
  "image",
  "undo",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "highlight",
  "link",
  "comment",
  "code",
  "block-paragraph",
  "block-heading",
  "block-check-list",
  "block-bulleted-list",
  "block-numbered-list",
  "block-quote",
  "text-color",
  "highlight-color",
  "more-styles",
]);
type AccessState = ReturnType<typeof usePluginContentAccess>;
type ReadyState = AccessState & {
  snapshot: NonNullable<AccessState["snapshot"]>;
  scope: NonNullable<AccessState["scope"]>;
  runtime: NonNullable<AccessState["runtime"]> & { data: MobileDataAdapter };
};
type BodyProps = {
  state: ReadyState;
  contentRef: string;
  kit: EditorKit;
  kind: "full" | "compact";
  placeholder?: string;
  at?: string;
};

export function previewBlockLimit(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.min(100, Math.floor(value))
    : 3;
}

export function PluginContentPreview({ contentRef, maxBlocks, kit = "full" }: ContentPreviewProps) {
  const state = usePluginContentAccess(contentRef, "read");
  const editorKit = useMobileContentKit("read", kit === "compact" ? "compact" : "full");
  if (kit !== "full" && kit !== "compact") return <p role="alert">不支持的编辑器套件</p>;
  if (!state.snapshot) return <ContentAccessNotice state={state} />;
  const nodes = state.snapshot.document.content.slice(0, previewBlockLimit(maxBlocks));
  return (
    <ErrorBoundary>
      <Editor
        key={JSON.stringify([state.scope?.id, contentRef, kit, nodes])}
        kit={editorKit}
        readonly
        initValue={nodes.length ? nodes : undefined}
        className="mobile-card-editor-content"
      />
    </ErrorBoundary>
  );
}

export function PluginContentEditor({
  contentRef,
  readonly = false,
  placeholder,
  at,
  kit = "full",
}: ContentEditorProps) {
  const state = usePluginContentAccess(contentRef, readonly ? "read" : "write");
  if (kit !== "full" && kit !== "compact") return <p role="alert">不支持的编辑器套件</p>;
  if (!state.snapshot || !state.scope || !state.runtime?.data)
    return <ContentAccessNotice state={state} />;
  return (
    <ErrorBoundary>
      {state.access?.edit && <ContentAccessNotice state={state} resolution={state.access.edit} />}
      <ContentBody
        key={JSON.stringify([
          state.scope.id,
          contentRef,
          kit,
          state.snapshot.binding,
          state.access?.writable,
        ])}
        state={state as ReadyState}
        contentRef={contentRef}
        kind={kit}
        placeholder={placeholder}
        at={at}
      />
    </ErrorBoundary>
  );
}

function ContentBody(props: Omit<BodyProps, "kit">) {
  const kit = useMobileContentKit("edit", props.kind);
  if (!kit) return <p role="status">编辑器正在准备…</p>;
  return props.state.snapshot.binding ? (
    <SharedBody {...props} kit={kit} />
  ) : (
    <LocalBody {...props} kit={kit} />
  );
}

function useViewGuard(state: ReadyState) {
  const { guard: accessGuard, canWrite: accessCanWrite } = state;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const guard = useCallback(() => {
    if (!mounted.current) throw new Error("编辑视图已失效");
    accessGuard();
  }, [accessGuard]);
  const canWrite = useCallback(() => mounted.current && accessCanWrite(), [accessCanWrite]);
  return { guard, canWrite };
}

function LocalBody(props: BodyProps) {
  const { state, contentRef, kit } = props;
  const { guard, canWrite } = useViewGuard(state);
  const documentRef = useRef<LocalContentDocument | undefined>(undefined);
  const [metadata, setMetadata] = useState<ContentDetailResponse>();
  const transport = useMemo(
    () => ({
      load: async () => {
        guard();
        const access = await state.runtime.data.resolveComponentContent(
          state.scope.context,
          contentRef,
          state.access?.writable ? "write" : "read"
        );
        guard();
        if (access.status !== "granted" || access.snapshot.binding)
          throw new Error("正文访问方式已变化，请重新打开");
        return access.snapshot.document;
      },
      save: async (payload: Parameters<typeof import("../../services/tauri").updateContent>[0]) => {
        guard();
        if (!canWrite() || !payload.expectedRevision) throw new Error("当前正文不可编辑");
        return state.runtime.data.saveComponentContent(
          state.scope.context,
          contentRef,
          payload.content as Descendant[],
          payload.contracts ?? {},
          payload.expectedRevision
        );
      },
    }),
    [state.runtime, state.scope.context, state.access?.writable, contentRef, guard, canWrite]
  );
  const editing = useEditContent(state.snapshot.document.contentId, {
    transport,
    guard,
    canWrite,
    saveMode: state.access?.writable ? "direct" : false,
    beforeSave: () => documentRef.current?.flush() ?? Promise.resolve(),
    onLoaded: setMetadata,
    onSaved: setMetadata,
    refreshKey: state.snapshot.document.revision ?? undefined,
  });
  const document = useLocalContentDocument({
    contentId: metadata?.contentId,
    content: editing.content,
    metadata,
    version: editing.syncVersion,
    kit,
    guard,
    canWrite,
    onChange: editing.handleEditorContentChange,
  });
  documentRef.current = document;
  const { flushNow } = editing;
  const flush = useCallback(async () => {
    await documentRef.current?.flush();
    return flushNow();
  }, [flushNow]);
  return (
    <EditorSurface
      {...props}
      document={document}
      canWrite={canWrite}
      guard={guard}
      flush={flush}
      error={editing.error}
      loading={editing.loading}
    />
  );
}

function SharedBody(props: BodyProps) {
  const { state, contentRef, kit } = props;
  const { guard, canWrite } = useViewGuard(state);
  useCollaborationRuntime();
  const documentId = state.snapshot.binding ?? "";
  const session = useCollabSession(documentId, {
    guard,
    canWrite,
    kit,
    project: () =>
      state.runtime.data.projectComponentContent(state.scope.context, contentRef, guard),
  });
  const flush = useCallback(async () => {
    guard();
    await collaborationManager.flushCache(documentId);
    guard();
    if (canWrite())
      await state.runtime.data.projectComponentContent(state.scope.context, contentRef, guard);
    return true;
  }, [guard, documentId, canWrite, state.runtime, state.scope.context, contentRef]);
  const { refetch } = state;
  useEffect(() => {
    if (session.ended) void refetch();
  }, [session.ended, refetch]);
  return (
    <>
      {session.offline && (
        <p role="status" className="text-ink-2 text-tau-meta py-2">
          协作暂时离线，输入沿原会话保留并等待同步。
        </p>
      )}
      <EditorSurface
        {...props}
        document={session.document}
        canWrite={() => canWrite() && !session.readonly}
        guard={guard}
        flush={flush}
        error={session.error}
        loading={session.loading || !session.document}
        onFocus={session.presence.onFocus}
        onBlur={session.presence.onBlur}
      />
      {session.error && (
        <button
          type="button"
          onClick={session.retry}
          className="text-accent-text text-tau-meta py-2"
        >
          重试连接
        </button>
      )}
    </>
  );
}

function EditorSurface({
  state,
  document,
  kind,
  kit,
  placeholder,
  at,
  canWrite,
  guard,
  flush,
  error,
  loading,
  onFocus,
  onBlur,
}: BodyProps & {
  document?: EditorDocument;
  canWrite(): boolean;
  guard(): void;
  flush(): Promise<boolean>;
  error?: string;
  loading?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const editorRef = useRef<EditorRef | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [mention, setMention] = useState<ContentMentionRequest>();
  const [saveError, setSaveError] = useState("");
  const controller = useMobileEditorToolbarController({ editorRef });
  const readonly = !canWrite() || !document || !!document.readonly;
  const save = useCallback(async () => {
    try {
      guard();
      (
        editorRef.current?.getEditor() as Partial<NodeTreeEditor> | undefined
      )?.flushNodeTreeInputs?.();
      const result = await flush();
      if (!result) setSaveError("输入尚未保存，请保留当前页面并重试");
      else setSaveError("");
      return result;
    } catch (failure) {
      setSaveError(String(failure));
      return false;
    }
  }, [guard, flush]);
  const { registerLeaveGuard } = state.scope;
  useEffect(() => {
    const registered = registerLeaveGuard?.(save);
    return () => {
      void registered?.dispose();
    };
  }, [registerLeaveGuard, save]);
  usePluginContentLocation(editorRef, container, document?.lineage, at, state.active && !loading);
  useContentMention({
    editorRef,
    documentKey: document,
    enabled: !readonly && kind === "full",
    onRequest: setMention,
  });
  useEffect(() => {
    if (!mention) return;
    const close = () => setMention(undefined);
    mention.signal.addEventListener("abort", close, { once: true });
    return () => mention.signal.removeEventListener("abort", close);
  }, [mention]);
  return (
    <div ref={setContainer} className="relative min-w-0">
      {loading && (
        <p role="status" className="text-ink-3 text-tau-meta py-3">
          正文正在准备…
        </p>
      )}
      {document && (
        <Editor
          ref={editorRef}
          kit={kit}
          document={document}
          readonly={readonly}
          placeHolder={placeholder}
          className="mobile-card-editor-content"
          onFocus={() => {
            onFocus?.();
            controller.handleEditorFocus();
          }}
          onBlur={() => {
            onBlur?.();
            controller.handleEditorBlur();
            if (!readonly) void save();
          }}
          onSelectionChange={controller.syncSelection}
        />
      )}
      {(error || saveError) && (
        <div role="alert" className="text-ink-2 text-tau-meta py-3">
          <p>{saveError || error}</p>
          {!readonly && (
            <button type="button" className="text-accent-text py-2" onClick={() => void save()}>
              重试保存
            </button>
          )}
        </div>
      )}
      <MobileEditorBottomToolbar
        controller={controller}
        readonly={readonly}
        portalContainer={container}
        visibleButtons={kind === "compact" ? COMPACT_BUTTONS : undefined}
      />
      {mention && (
        <ContentLinkPickerSheet
          open
          onClose={() => {
            mention.cancel();
            setMention(undefined);
          }}
          onSelect={result => {
            if (canWrite()) mention.select(result);
            else mention.cancel();
            setMention(undefined);
          }}
        />
      )}
    </div>
  );
}
