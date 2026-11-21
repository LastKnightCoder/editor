import toolRegistry from "@/tools/toolRegistry";
import { retainWhiteboardToolScope } from "@/services/whiteboard-documents/agent-scope";
import { whiteboardAgentTools } from "@/services/whiteboard-documents/agent-tools";
import { getWhiteboardBodyKit } from "@/features/shared/whiteboard/editorKit";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import {
  referenceWhiteboardEntity,
  resolveWhiteboardEntity,
  uploadWhiteboardDocumentResource,
  resolveWhiteboardDocumentResource,
  importWhiteboardDocumentResource,
  readWhiteboardDocumentResource,
  copyWhiteboardDocumentContent,
} from "@/commands/whiteboard-document";
import { useDesktopPlugins } from "@/app/plugins/context";
import { desktopContentPlugins } from "../../../../shared/content-plugins";
import type { WhiteboardContractCatalog } from "@tau/whiteboard/collaboration";
import {
  useEffect,
  useImperativeHandle,
  useInsertionEffect,
  useMemo,
  useRef,
  useLayoutEffect,
  useSyncExternalStore,
  type Ref,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Loading } from "@tau/ui";
import {
  createWhiteboardBinding,
  prepareBuiltinWhiteboardTypes,
} from "@tau/whiteboard/collaboration";
import type { WhiteboardExtension } from "@tau/whiteboard";
import Whiteboard from "@/features/shared/whiteboard/DesktopWhiteboard";
import useSettingStore from "@/stores/useSettingStore";
import {
  whiteboardDocumentEntry,
  whiteboardRemoteSync,
} from "@/services/whiteboard-documents/registry";
import type { WhiteboardDocumentClient } from "@/services/whiteboard-documents/client";
import type { BoardCanvasHandle } from "./BoardCanvas";
import {
  PendingTransition,
  WhiteboardCollaborationBoundary,
  WhiteboardCollaborationBar,
  WhiteboardShareEntry,
} from "./WhiteboardCollaborationBar";
import { usePage } from "@/page/PageProvider";

interface Props {
  contentId: number;
  documentId: string;
  pageId: string;
  extensions?: readonly WhiteboardExtension[];
  /** 白板页面在右下状态栏提供共享入口；嵌入其它页面的画布只显示保存与同步状态。 */
  collaboration?: boolean;
  onPresentationModeChange?: (value: boolean) => void;
  onDockWidthChange?: (value: number) => void;
  ref?: Ref<BoardCanvasHandle>;
}
export function DocumentBoardCanvas(props: Props) {
  const pluginRevision = useSyncExternalStore(
    desktopContentPlugins.subscribe,
    desktopContentPlugins.getRevision,
    desktopContentPlugins.getRevision
  );
  const contracts = useQuery({
    queryKey: ["whiteboard-plugin-contracts", pluginRevision],
    queryFn: async () => {
      const catalog = await desktopContentPlugins.prepareWhiteboardContracts(),
        builtins = await prepareBuiltinWhiteboardTypes();
      const editor = await desktopContentPlugins.prepareEditorContracts(
        getWhiteboardBodyKit().extensions
      );
      const prepared = await Promise.all(
        Object.values(editor.dictionary).map(contract => {
          if (contract.domain !== "editor-node") throw new Error("正文契约领域不符");
          return prepareContentContract(contract.owner, {
            type: contract.type,
            dataVersion: contract.dataVersion,
            kind: contract.kind,
            isVoid: contract.isVoid,
            collaboration: { textFields: contract.textFields },
            resources: contract.resources,
          });
        })
      );
      return { catalog, builtins, editor, prepared };
    },
    staleTime: Infinity,
  });
  const databaseName = useSettingStore(state => state.setting.database.active);
  const entry = useMemo(
    () => whiteboardDocumentEntry({ databaseName, contentId: props.contentId }, props.documentId),
    [databaseName, props.contentId, props.documentId]
  );
  // Activity 停驻会回收普通 effect，插入期持有只在真实卸载或目标变化时释放。
  useInsertionEffect(() => entry.retain(), [entry]);
  const session = useSyncExternalStore(entry.subscribe, entry.getSnapshot, entry.getSnapshot);
  const retry = () => void entry.open().catch(() => undefined);
  useEffect(() => {
    void entry.open().catch(() => undefined);
  }, [entry]);
  if (contracts.isPending) return <Loading />;
  const error = session.error ?? contracts.error;
  const recovery = (
    <WhiteboardCollaborationBoundary resetKey={props.documentId}>
      <PendingTransition
        databaseName={databaseName}
        documentId={props.documentId}
        onSettled={retry}
      >
        <div role="alert" className="text-ink-2 p-3">
          {session.client ? "白板会话切换失败，当前画布只读。" : "白板文档读取失败。"}
          {error instanceof Error ? error.message : "请重试"}
          <Button onClick={() => void Promise.allSettled([entry.open(), contracts.refetch()])}>
            重试
          </Button>
        </div>
      </PendingTransition>
    </WhiteboardCollaborationBoundary>
  );
  if (contracts.isError || !contracts.data) return recovery;
  if (!session.client || session.client.isDisposed)
    return session.phase === "error" ? recovery : <Loading />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {session.phase === "error" && recovery}
      {session.phase === "opening" && (
        <div role="status" className="text-ink-2 p-3">
          正在切换白板会话，当前画布只读…
        </div>
      )}
      <div className="min-h-0 flex-1">
        <BoundDocumentCanvas
          key={`${pluginRevision}:${session.client.viewId}`}
          {...props}
          client={session.client}
          catalog={contracts.data.catalog}
          builtins={contracts.data.builtins}
          editor={contracts.data.editor}
          editorPrepared={contracts.data.prepared}
        />
      </div>
    </div>
  );
}
function BoundDocumentCanvas({
  client,
  catalog,
  builtins,
  editor,
  editorPrepared,
  pageId,
  documentId,
  collaboration,
  extensions,
  ref,
  onPresentationModeChange,
  onDockWidthChange,
}: Props & {
  client: WhiteboardDocumentClient;
  catalog: WhiteboardContractCatalog;
  builtins: Awaited<ReturnType<typeof prepareBuiltinWhiteboardTypes>>;
  editor: Awaited<ReturnType<typeof desktopContentPlugins.prepareEditorContracts>>;
  editorPrepared: Awaited<ReturnType<typeof prepareContentContract>>[];
}) {
  const pluginRuntime = useDesktopPlugins(),
    runtimeRef = useRef(pluginRuntime);
  runtimeRef.current = pluginRuntime;
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useInsertionEffect(() => client.retainModel(), [client]);
  const { registerLeaveGuard } = usePage();
  const initialPage = useRef(pageId);
  const binding = useMemo(() => {
    const identity = client.identity;
    if (!identity) throw new Error("白板文档会话尚未打开");
    const activations = new Map<string, unknown>();
    return createWhiteboardBinding(client.model, {
      pageId: initialPage.current,
      documentId: identity.documentId,
      createContentCopy: async id => {
        await client.flush();
        if (!client.leaseId) throw new Error("白板会话已关闭");
        return copyWhiteboardDocumentContent(client.leaseId, id);
      },
      readResource: reference => {
        if (!client.leaseId) throw new Error("白板会话已关闭");
        return readWhiteboardDocumentResource(client.leaseId, reference);
      },
      uploadResource: file => {
        if (!client.leaseId) throw new Error("白板会话已关闭");
        return uploadWhiteboardDocumentResource(client.leaseId, file);
      },
      importResource: (reference, source) => {
        if (!client.leaseId) throw new Error("白板会话已关闭");
        return importWhiteboardDocumentResource(client.leaseId, source, reference);
      },
      referenceEntity: (kind, id) => referenceWhiteboardEntity(identity.databaseName, kind, id),
      resolveEntity: reference => resolveWhiteboardEntity(identity.databaseName, reference),
      types: builtins.types,
      preparedContracts: [...builtins.prepared, ...editorPrepared],
      editorVersions: editor,
      catalog,
      canEditContract: entry => {
        try {
          const storage = runtimeRef.current?.host.getStorage(entry.contract.owner);
          if (!storage) return false;
          if (
            activations.has(entry.contract.owner) &&
            activations.get(entry.contract.owner) !== storage
          )
            return false;
          activations.set(entry.contract.owner, storage);
          return true;
        } catch {
          return false;
        }
      },
      coalesceLocalGesture: () => whiteboardRemoteSync(client)?.getSnapshot().phase === "local",
      canWrite: () => !client.getSnapshot().frozen && client.getSnapshot().phase !== "error",
    });
  }, [client, catalog, builtins, editor, editorPrepared]);
  useInsertionEffect(
    () => client.registerInputFlush(() => binding.flushInputs()),
    [client, binding]
  );
  useLayoutEffect(() => {
    if (binding.pageId !== pageId) binding.switchPage(pageId);
  }, [binding, pageId]);
  useImperativeHandle(
    ref,
    () => ({
      flush: () => client.flush(),
      document: {
        snapshot: () => client.model.read(),
        pageTitle: pageId => binding.pageTitle(pageId),
        duplicatePage: async pageId => {
          const id = await binding.duplicatePage(pageId);
          await client.flush();
          return id;
        },
        submit: async commands => {
          const result = binding.submit(commands);
          await client.flush();
          return result;
        },
      },
    }),
    [client, binding]
  );
  useEffect(
    () =>
      registerLeaveGuard(async () => {
        try {
          if (client.needsReopen || client.isDisposed) {
            await client.preservePending();
            return true;
          }
          await client.flush();
          return true;
        } catch {
          return false;
        }
      }),
    [registerLeaveGuard, client]
  );
  const remoteSync = whiteboardRemoteSync(client);
  useLayoutEffect(() => {
    if (!collaboration) return;
    const scope = "whiteboard-" + crypto.randomUUID();
    const lifetime = new AbortController();
    toolRegistry.registerScopedTools(
      scope,
      "当前白板",
      whiteboardAgentTools(scope, binding, client, remoteSync, lifetime.signal)
    );
    const release = retainWhiteboardToolScope(scope);
    return () => {
      lifetime.abort();
      remoteSync?.reportAgent(null);
      release();
      toolRegistry.unregisterSource(scope);
    };
  }, [binding, client, collaboration, pageId, remoteSync]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WhiteboardCollaborationBoundary resetKey={client.viewId}>
        <WhiteboardCollaborationBar client={client} documentId={documentId} />
      </WhiteboardCollaborationBoundary>
      <div className="min-h-0 flex-1">
        <Whiteboard
          key={client.viewId}
          document={binding}
          presence={remoteSync ? { pageId, channel: remoteSync } : undefined}
          documentResources={{
            upload: async file => {
              if (!client.leaseId || client.getSnapshot().frozen)
                throw new Error("白板资源当前不可写");
              return uploadWhiteboardDocumentResource(client.leaseId, {
                name: file.name,
                mime: file.type,
                bytes: new Uint8Array(await file.arrayBuffer()),
              });
            },
            remoteResourceToLocal: async reference => {
              if (!client.leaseId) throw new Error("白板会话已关闭");
              return resolveWhiteboardDocumentResource(client.leaseId, reference);
            },
          }}
          initData={[]}
          readonly={state.frozen || state.phase === "error"}
          className="h-full w-full"
          extensions={extensions}
          onPresentationModeChange={onPresentationModeChange}
          onDockWidthChange={onDockWidthChange}
          statusBarEnd={
            collaboration ? (
              <WhiteboardCollaborationBoundary resetKey={client.viewId}>
                <WhiteboardShareEntry client={client} documentId={documentId} />
              </WhiteboardCollaborationBoundary>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
