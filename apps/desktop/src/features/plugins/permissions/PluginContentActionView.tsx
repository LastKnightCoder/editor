import {
  pluginControlsTranslator,
  pluginControlsCount,
  usePluginControlsI18n,
  pluginControlsNotebookImpact,
} from "../controls.i18n";
import { useEffect, useRef } from "react";
import ContentExportModal from "@/components/ContentExportModal";
import { SnapshotImagePreview } from "@/components/ContentExportModal/SnapshotImagePreview";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import PresentationMode from "@/components/PresentationMode";
import ContentCollaborationControl, {
  type ContentCollaborationControlHandle,
} from "@/components/ContentCollaborationControl";
import { CreateCardDialog } from "@/features/cards/components/CreateCardDialog";
import InsertNoteToTreeModal from "@/components/InsertNoteToTreeModal";
import { ConfirmDialog, toast } from "@tau/ui";
import { createNotebookWithResources } from "@/services/notebook-creation";
import { getContentKit } from "@/services/editorKit";
import type {
  PluginActionRequest,
  PluginContentActionRequest,
  PluginNotebookCreateRequest,
} from "@/app/plugins/app";
const t = pluginControlsTranslator.t;

/** 与卡片详情「导出 / 演示 / 发起协作」、「新建卡片」「插入到项目」同一组宿主组件；关闭即撤下请求 */
export default function PluginContentActionView({ request }: { request: PluginActionRequest }) {
  usePluginControlsI18n();
  if (request.action === "card.create")
    return (
      <CreateCardDialog
        open
        initial={{ content: request.content, tags: request.tags, contracts: request.contracts }}
        onCreated={card => request.settle(card.id)}
        onClose={request.close}
      />
    );
  if (request.action === "notebook.create") return <NotebookCreateAction request={request} />;
  if (request.action === "project.insertDocument")
    return (
      <InsertNoteToTreeModal
        mode="project"
        open
        noteTitle={request.title}
        noteContent={request.content}
        contracts={request.contracts}
        {...(request.sharedContentId !== undefined
          ? { insertMode: "shared-content" as const, sourceContentId: request.sharedContentId }
          : {})}
        onCancel={request.close}
        onSuccess={item => (item ? request.settle(item.id) : request.close())}
      />
    );
  if (request.action === "present")
    return <PresentationMode content={request.content} onExit={request.close} />;
  if (request.action === "share") return <ShareAction request={request} />;
  if (request.format === "image")
    return (
      <ContentExportModal
        open
        onClose={request.close}
        renderPreview={preview => (
          <SnapshotImagePreview {...preview} content={request.content} kit={getContentKit()} />
        )}
      />
    );
  if (request.format === "epub")
    return (
      <EpubExportModal
        open
        onClose={request.close}
        content={request.content}
        title={request.title}
      />
    );
  return (
    <PdfExportModal
      visible
      onClose={request.close}
      content={request.content}
      title={request.title}
    />
  );
}

/** 与问题「以此立项」同一口径：说明带入几份资料、几项带不进去，确认后新建 */
function NotebookCreateAction({ request }: { request: PluginNotebookCreateRequest }) {
  usePluginControlsI18n();
  return (
    <ConfirmDialog
      open
      onOpenChange={next => {
        if (!next) request.close();
      }}
      title={t("notebook.new")}
      context={request.title}
      description={t("notebook.hint")}
      impact={pluginControlsNotebookImpact(request.plan)}
      confirmText={t("common.new")}
      onConfirm={async () => {
        try {
          const { projectId, failed } = await createNotebookWithResources({
            title: request.title,
            plan: request.plan,
            ...(request.from ? { from: request.from } : {}),
            mainDbName: request.databaseName,
          });
          if (failed) toast.warning(pluginControlsCount("notebook.resourcesFailed", failed));
          request.settle(projectId);
        } catch (error) {
          console.error("新建 Notebook 失败", error);
          toast.error(t("notebook.failed"));
        }
      }}
    />
  );
}

function ShareAction({ request }: { request: PluginContentActionRequest }) {
  usePluginControlsI18n();
  const control = useRef<ContentCollaborationControlHandle>(null);
  useEffect(() => control.current?.open(), []);
  return (
    <ContentCollaborationControl
      ref={control}
      hideTrigger
      contentId={request.contentId}
      source={request.source}
      onClose={request.close}
    />
  );
}
