import { pluginControlsTranslator, usePluginControlsI18n } from "./controls.i18n";
import { richTextPlainText } from "../../utils/richTextText";
import { createNodeDocument, NodeTree, type ContentNode } from "@tau/collaboration";
import { createNodeTreeDocument, type NodeTreeEditor } from "@tau/editor-collab";
import type { Descendant } from "slate";
import { mobileContentPlugins } from "../../app/plugins/content";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Editor, type EditorRef, type EditorDocument } from "@tau/editor";
import type { PluginProjectNode } from "@tau/plugins";
import { BottomSheet } from "../../components/BottomSheet";
import { EditorKitPending } from "../../components/EditorKitPending";
import { useMobileContentKit } from "../../services/editorKit";
import { useNavigator, useRouterContext } from "../../router";
import type { MobileAppActions, MobileAppActionRequest } from "../../app/plugins/app-actions";
import { MobileEditorBottomToolbar } from "../cards/editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "../cards/editorToolbar/useMobileEditorToolbarController";
import { useCollaborationRuntime } from "../collaboration/hooks/useCollaborationRuntime";
import { toast } from "../../components/toast";
const t = pluginControlsTranslator.t;

const ShareContentSheet = lazy(() =>
  import("../collaboration/ShareContentSheet").then(module => ({
    default: module.ShareContentSheet,
  }))
);
const MemberManageSheet = lazy(() =>
  import("../collaboration/MemberManageSheet").then(module => ({
    default: module.MemberManageSheet,
  }))
);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function PluginAppActionHost({ actions }: { actions: MobileAppActions }) {
  usePluginControlsI18n();
  const request = useSyncExternalStore(actions.subscribe, actions.getSnapshot);
  return request ? <Action key={request.id} request={request} /> : null;
}
function Action({ request }: { request: MobileAppActionRequest }) {
  usePluginControlsI18n();
  const navigator = useNavigator();
  useRouterContext();
  const entryId = (navigator.getTopOverlay() ?? navigator.getActiveScreen())?.id;
  const initialEntry = useRef(entryId);
  useEffect(() => {
    if (entryId !== initialEntry.current) {
      request.close();
      return;
    }
    if (!entryId) return;
    return navigator.registerBackHandler(
      entryId,
      () => {
        request.close();
        return true;
      },
      { blockEdgeBack: true }
    );
  }, [entryId, navigator, request]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") request.close();
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [request]);
  return request.input.action === "content.share" ? (
    <Share request={request} />
  ) : (
    <Create request={request} />
  );
}
function Share({ request }: { request: MobileAppActionRequest }) {
  usePluginControlsI18n();
  const [confirmed, setConfirmed] = useState(false);
  const target = useQuery({
    queryKey: ["plugin-share-action", request.id],
    queryFn: request.shareTarget,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  if (target.data && (target.data.binding || confirmed))
    return (
      <SharedContent
        request={request}
        binding={target.data.binding}
        contentId={target.data.document.contentId}
        title={
          richTextPlainText(target.data.document.content).trim().slice(0, 40) || t("share.content")
        }
      />
    );
  return (
    <BottomSheet open title={t("share.title")} onClose={request.close}>
      <p className="text-ink-2">
        {request.plugin.name}
        {t("share.hint")}
      </p>
      {target.data && (
        <p className="text-ink-1 mt-3">
          {richTextPlainText(target.data.document.content).trim().slice(0, 120) || t("share.blank")}
        </p>
      )}
      {target.error && <p role="alert">{errorText(target.error)}</p>}
      <button
        type="button"
        className="bg-accent text-ink-inverse rounded-tau-lg mt-4 w-full py-3 font-semibold disabled:opacity-50"
        disabled={!target.data}
        onClick={() => {
          request.check();
          setConfirmed(true);
        }}
      >
        {t("share.start")}
      </button>
    </BottomSheet>
  );
}
function SharedContent({
  request,
  binding,
  contentId,
  title,
}: {
  request: MobileAppActionRequest;
  binding: string | null;
  contentId: number;
  title: string;
}) {
  usePluginControlsI18n();
  useCollaborationRuntime();
  const onError = (error: unknown) => {
    if (!request.signal.aborted) toast.error(errorText(error));
  };
  return (
    <Suspense fallback={<EditorKitPending />}>
      {binding ? (
        <MemberManageSheet
          documentId={binding}
          onClose={request.close}
          onExit={request.close}
          onError={onError}
          backDismiss
          guard={request.check}
        />
      ) : (
        <ShareContentSheet
          open
          contentId={contentId}
          title={title}
          sourceType="content"
          sourceId={contentId}
          guard={request.check}
          expectedRef={request.input.action === "content.share" ? request.input.ref : undefined}
          onClose={request.close}
          onError={onError}
        />
      )}
    </Suspense>
  );
}
function positions(nodes: PluginProjectNode[], prefix = ""): { id: string; title: string }[] {
  return nodes.flatMap(node => {
    const title = prefix ? `${prefix} / ${node.title}` : node.title;
    return [{ id: node.documentId, title }, ...positions(node.children, title)];
  });
}
function Create({ request }: { request: MobileAppActionRequest }) {
  usePluginControlsI18n();
  const input = request.input;
  const isProject = input.action === "project.insertDocument";
  const shared = isProject && "shareOf" in input.content;
  const prepared = useQuery({
    queryKey: ["plugin-create-action", request.id],
    queryFn: request.prepare,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const [projectId, setProjectId] = useState("");
  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState(isProject ? (input.title ?? "未命名文档") : "");
  const [tags, setTags] = useState(
    input.action === "card.create" ? (input.tags ?? []).join("，") : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const projects = useInfiniteQuery({
    queryKey: ["plugin-create-projects", request.id],
    queryFn: ({ pageParam }) => request.projects(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor,
    enabled: isProject,
    gcTime: 0,
  });
  const tree = useQuery({
    queryKey: ["plugin-create-position", request.id, projectId],
    queryFn: () => request.tree(projectId),
    enabled: isProject && !!projectId,
    gcTime: 0,
  });
  const draftTree = useRef<NodeTree | null>(null);
  const [document, setDocument] = useState<EditorDocument>();
  const savingRef = useRef(false);
  const kit = useMobileContentKit("edit");
  const editorRef = useRef<EditorRef | null>(null);
  const toolbar = useMobileEditorToolbarController({ editorRef });
  useEffect(() => {
    const initial = prepared.data;
    if (!kit || !initial) return;
    let cancelled = false;
    let tree: NodeTree | undefined;
    void (async () => {
      const versions = await mobileContentPlugins.prepareEditorContracts(kit.extensions);
      const doc = await createNodeDocument(
        {
          documentId: `plugin-draft:${request.id}`,
          baselineId: `plugin-draft:${request.id}`,
          epoch: 0,
        },
        {
          title: "",
          bannerBg: "",
          bannerPosition: "center",
          content: initial.nodes as ContentNode[],
        },
        initial.contracts
      );
      if (cancelled || request.signal.aborted) {
        doc.destroy();
        return;
      }
      tree = new NodeTree(doc);
      draftTree.current = tree;
      setDocument(
        createNodeTreeDocument(tree, {
          versions,
          normalizeOnConnect: false,
          readonly: shared,
          canWrite: () => !cancelled && !request.signal.aborted && !savingRef.current && !shared,
        })
      );
    })().catch(failure => {
      if (!cancelled && !request.signal.aborted) setError(errorText(failure));
    });
    return () => {
      cancelled = true;
      draftTree.current = null;
      tree?.dispose();
      tree?.doc.destroy();
    };
  }, [kit, prepared.data, request, shared]);
  const save = async () => {
    if (!prepared.data || savingRef.current || !kit || !draftTree.current) return;
    setError("");
    try {
      request.check();
      (editorRef.current?.getEditor() as NodeTreeEditor | undefined)?.flushNodeTreeInputs();
      savingRef.current = true;
      setSaving(true);
      await request.submit({
        content: {
          ...prepared.data,
          nodes: draftTree.current.read() as Descendant[],
          contracts: draftTree.current.contracts.toJSON(),
        },
        title,
        tags: [
          ...new Set(
            tags
              .split(/[，,]/)
              .map(tag => tag.trim())
              .filter(Boolean)
          ),
        ],
        projectId,
        parentId: parentId || undefined,
      });
    } catch (failure) {
      if (!request.signal.aborted) setError(errorText(failure));
    } finally {
      savingRef.current = false;
      if (!request.signal.aborted) setSaving(false);
    }
  };
  return (
    <BottomSheet
      open
      dismissible={!saving}
      title={isProject ? t("create.projectDocument") : t("create.card")}
      onClose={request.close}
    >
      <p className="text-ink-3 mb-3">{t("create.source", { name: request.plugin.name })}</p>
      {isProject ? (
        <div className="space-y-3">
          <label className="block">
            {t("create.title")}
            <input
              className="input-base w-full"
              value={title}
              onChange={event => setTitle(event.target.value)}
              disabled={saving}
            />
          </label>
          <label className="block">
            {t("create.project")}
            <select
              className="input-base w-full"
              value={projectId}
              disabled={saving}
              onChange={event => {
                setProjectId(event.target.value);
                setParentId("");
              }}
            >
              <option value="">{t("create.chooseProject")}</option>
              {projects.data?.pages
                .flatMap(page => page.items)
                .filter(project => !project.archived)
                .map(project => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
            </select>
          </label>
          {projects.hasNextPage && (
            <button
              type="button"
              disabled={projects.isFetchingNextPage}
              onClick={() => void projects.fetchNextPage()}
            >
              {t("create.moreProjects")}
            </button>
          )}
          {projectId && (
            <label className="block">
              {t("create.position")}
              <select
                className="input-base w-full"
                value={parentId}
                disabled={saving || !tree.isSuccess}
                onChange={event => setParentId(event.target.value)}
              >
                <option value="">{t("create.root")}</option>
                {positions(tree.data ?? []).map((position, index) => (
                  <option key={`${position.id}:${index}`} value={position.id}>
                    {position.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {shared && <p className="text-ink-2">{t("create.shared")}</p>}
        </div>
      ) : (
        <label className="block">
          {t("create.tags")}
          <input
            className="input-base w-full"
            value={tags}
            onChange={event => setTags(event.target.value)}
            placeholder={t("create.tagsHint")}
            disabled={saving}
          />
        </label>
      )}
      {prepared.error || projects.error || tree.error ? (
        <p role="alert">{errorText(prepared.error ?? projects.error ?? tree.error)}</p>
      ) : null}
      {prepared.data && kit && document ? (
        <Editor
          ref={editorRef}
          kit={kit}
          document={document}
          readonly={saving || shared}
          className="mobile-card-editor-content mt-3 min-h-[160px]"
          onFocus={toolbar.handleEditorFocus}
          onBlur={toolbar.handleEditorBlur}
          onChange={() => toolbar.syncSelection()}
          onSelectionChange={toolbar.syncSelection}
        />
      ) : (
        <EditorKitPending />
      )}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="bg-accent text-ink-inverse rounded-tau-lg mt-4 w-full py-3 font-semibold disabled:opacity-50"
        disabled={
          saving ||
          !prepared.data ||
          !kit ||
          !document ||
          (isProject && (!projectId || !tree.isSuccess))
        }
        onClick={() => void save()}
      >
        {saving ? t("common.saving") : t("common.save")}
      </button>
      {!shared && <MobileEditorBottomToolbar controller={toolbar} />}
    </BottomSheet>
  );
}
