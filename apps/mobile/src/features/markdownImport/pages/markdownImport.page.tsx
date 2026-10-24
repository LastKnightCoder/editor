import { useMemo, useState, type ReactNode } from "react";
import { FolderOpen, Layers, Newspaper } from "lucide-react";
import { Editor, createValueDocument } from "@tau/editor";
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

  const content = useMemo(() => parseIncomingMarkdown(params.markdown), [params.markdown]);
  const document = useMemo(() => createValueDocument(content), [content]);
  const count = useMemo(() => getContentLength(content), [content]);
  const title = params.title || "未命名";
  const projects = (projectsQuery.data?.pages.flatMap(page => page.items) ?? []).filter(
    project => !project.archived
  );

  // 创建非幂等：single flight 防连点重复导入
  const runImport = useSingleFlight(async (create: () => Promise<void>) => {
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
      const card = await tauri.createQuickCard({ content, count });
      void app.refreshCardsSafe({ page: 1 });
      toast({ type: "success", text: "已导入为卡片" });
      navigator.replace("contentDetail", { cardId: card.id });
    });

  const importAsArticle = () =>
    runImport(async () => {
      const article = await tauri.articleCreate({ title, content, count });
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
        content,
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
          <div className="px-5 pb-8 pt-1.5">
            <h2 className="text-ink-1 break-words text-[22px] font-extrabold leading-snug">
              {title}
            </h2>
            <p className="text-ink-3 mt-1 text-[12.5px] font-bold">外部文件 · {count} 字</p>
            <div className="mt-4">
              <Editor
                key={params.markdown}
                kit={kit}
                document={document}
                readonly
                className="mobile-card-editor-content"
              />
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
            disabled={importing}
            onClick={() => void importAsCard()}
          />
          <ImportButton
            icon={<Newspaper size={18} />}
            label="存为文章"
            disabled={importing}
            onClick={() => void importAsArticle()}
          />
          <ImportButton
            icon={<FolderOpen size={18} />}
            label="加入项目"
            disabled={importing}
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
