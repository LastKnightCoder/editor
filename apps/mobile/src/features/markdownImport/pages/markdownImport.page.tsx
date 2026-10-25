import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Layers, Newspaper } from "lucide-react";
import { Editor, type EditorDocument } from "@tau/editor";
import { createNodeDocument, NodeTree, type ContentNode } from "@tau/collaboration";
import { createNodeTreeDocument } from "@tau/editor-collab";
import { mobileContentPlugins } from "../../../app/plugins/content";
import { EditorKitPending } from "../../../components/EditorKitPending";
import { PageHeader } from "../../../components/PageHeader";
import { ActionSheet } from "../../../components/ActionSheet";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import * as tauri from "../../../services/tauri";
import { useMobileContentKit } from "../../../services/editorKit";
import { useSingleFlight } from "../../../hooks/useSingleFlight";
import { getContentLength } from "../../cards/editorContentUtils";
import { useInvalidateArticles } from "../../articles/queries";
import { useInvalidateProjects, useProjectsQuery } from "../../projects/queries";
import { createPageSchema, definePage, paramString, useNavigator, usePage } from "../../../router";
import { parseIncomingMarkdown } from "../parseIncomingMarkdown";
import type { Project } from "../../../types";

const markdownImportSchema = createPageSchema({
  title: paramString(""),
  markdown: paramString(""),
});
type MarkdownImportParams = typeof markdownImportSchema.type;

function ImportButton(props: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="bg-surface shadow-card text-ink-1 flex h-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-extrabold disabled:opacity-50"
    >
      {props.icon}
      {props.label}
    </button>
  );
}

/** 外部打开的 Markdown：只读预览，由用户决定导入为卡片、文章或项目文档 */
function MarkdownImportScreen() {
  const { params } = usePage<MarkdownImportParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  const kit = useMobileContentKit("read");
  const invalidateArticles = useInvalidateArticles();
  const invalidateProjects = useInvalidateProjects();
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const projectsQuery = useProjectsQuery();

  const pluginRevision = useSyncExternalStore(
    mobileContentPlugins.subscribe,
    mobileContentPlugins.getRevision,
    mobileContentPlugins.getRevision
  );
  const parsed = useQuery({
    queryKey: ["markdown-import", params.markdown, pluginRevision],
    queryFn: () => parseIncomingMarkdown(params.markdown),
    retry: false,
  });
  const [document, setDocument] = useState<EditorDocument>();
  const [previewError, setPreviewError] = useState<string>();
  useEffect(() => {
    setDocument(undefined);
    setPreviewError(undefined);
    if (!parsed.data) return;
    let cancelled = false;
    let tree: NodeTree | undefined;
    void (async () => {
      const versions = await mobileContentPlugins.prepareEditorContracts(kit.extensions);
      const doc = await createNodeDocument(
        { documentId: "markdown-preview", baselineId: "markdown-preview", epoch: 0 },
        {
          title: "",
          bannerBg: "",
          bannerPosition: "center",
          content: parsed.data!.content as ContentNode[],
        },
        parsed.data!.contracts
      );
      if (cancelled) {
        doc.destroy();
        return;
      }
      tree = new NodeTree(doc);
      setDocument(
        createNodeTreeDocument(tree, { versions, readonly: true, normalizeOnConnect: false })
      );
    })().catch(error => {
      if (!cancelled) setPreviewError(String(error));
    });
    return () => {
      cancelled = true;
      tree?.dispose();
      tree?.doc.destroy();
    };
  }, [parsed.data, kit]);
  const count = useMemo(() => getContentLength(parsed.data?.content ?? []), [parsed.data]);
  const title = params.title || "未命名";
  const projects = (projectsQuery.data?.pages.flatMap(page => page.items) ?? []).filter(
    project => !project.archived
  );

  // 创建非幂等：single flight 防连点重复导入
  const runImport = useSingleFlight(async (create: () => Promise<void>) => {
    if (!parsed.data) return;
    setImporting(true);
    try {
      await create();
    } catch (error) {
      app.presentError(error, "导入失败");
    } finally {
      setImporting(false);
    }
  });

  const importAsCard = () =>
    runImport(async () => {
      const card = await tauri.createQuickCard({ ...parsed.data!, count });
      void app.refreshCardsSafe({ page: 1 });
      toast({ type: "success", text: "已导入为卡片" });
      navigator.replace("contentDetail", { cardId: card.id });
    });

  const importAsArticle = () =>
    runImport(async () => {
      const article = await tauri.articleCreate({ title, ...parsed.data!, count });
      invalidateArticles();
      toast({ type: "success", text: "已导入为文章" });
      navigator.replace("articleEditor", { articleId: article.id });
    });

  const importToProject = (project: Project) =>
    runImport(async () => {
      setProjectSheetOpen(false);
      const item = await tauri.projectItemCreate({
        projectId: project.id,
        title,
        itemType: "document",
        ...parsed.data!,
        count,
      });
      invalidateProjects();
      toast({ type: "success", text: `已导入到「${project.title}」` });
      navigator.replace("projectDocEditor", { itemId: item.id, projectTitle: project.title });
    });

  const openProjectSheet = () => {
    if (projectsQuery.isSuccess && projects.length === 0) {
      toast({ type: "info", text: "还没有项目，先到项目页新建一个" });
      return;
    }
    setProjectSheetOpen(true);
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title="Markdown 预览" onBack={() => navigator.goBack("ui")} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mobile-page-scroll flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 pt-1.5 pb-8">
            <h2 className="text-ink-1 text-[22px] leading-snug font-extrabold break-words">
              {title}
            </h2>
            <p className="text-ink-3 mt-1 text-[12.5px] font-bold">外部文件 · {count} 字</p>
            <div className="mt-4">
              {parsed.error || previewError ? (
                <p role="alert">{parsed.error?.message ?? previewError}</p>
              ) : document ? (
                <Editor
                  key={params.markdown}
                  kit={kit}
                  document={document}
                  readonly
                  className="mobile-card-editor-content"
                />
              ) : (
                <EditorKitPending />
              )}
            </div>
          </div>
        </div>

        <div
          className="flex flex-none gap-2.5 px-[18px] pt-3.5"
          style={{ background: "linear-gradient(to top, var(--tau-bg-page) 62%, transparent)" }}
        >
          <ImportButton
            icon={<Layers size={18} />}
            label="存为卡片"
            disabled={importing || !parsed.data}
            onClick={() => void importAsCard()}
          />
          <ImportButton
            icon={<Newspaper size={18} />}
            label="存为文章"
            disabled={importing || !parsed.data}
            onClick={() => void importAsArticle()}
          />
          <ImportButton
            icon={<FolderOpen size={18} />}
            label="加入项目"
            disabled={importing || !parsed.data}
            onClick={openProjectSheet}
          />
        </div>
      </div>

      <ActionSheet
        open={projectSheetOpen}
        title="导入到项目"
        subtitle={`作为「${title}」文档放在项目根目录`}
        items={projects.map(project => ({
          label: project.title,
          icon: <FolderOpen size={16} />,
          onClick: () => void importToProject(project),
        }))}
        onClose={() => setProjectSheetOpen(false)}
      />
    </div>
  );
}

export default definePage({
  key: "markdownImport",
  match: "single",
  params: markdownImportSchema.schema,
  component: MarkdownImportScreen,
});
