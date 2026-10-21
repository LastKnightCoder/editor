import { useEffect, useRef } from "react";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import PresentationMode from "@/components/PresentationMode";
import ContentCollaborationControl, {
  type ContentCollaborationControlHandle,
} from "@/components/ContentCollaborationControl";
import { CreateCardDialog } from "@/features/cards/components/CreateCardDialog";
import InsertNoteToTreeModal from "@/components/InsertNoteToTreeModal";
import type { PluginActionRequest, PluginContentActionRequest } from "@/app/plugins/app";

/** 与卡片详情「导出 / 演示 / 发起协作」、「新建卡片」「插入到项目」同一组宿主组件；关闭即撤下请求 */
export default function PluginContentActionView({ request }: { request: PluginActionRequest }) {
  if (request.action === "card.create")
    return (
      <CreateCardDialog
        open
        initial={{ content: request.content, tags: request.tags }}
        onCreated={card => request.settle(card.id)}
        onClose={request.close}
      />
    );
  if (request.action === "project.insertDocument")
    return (
      <InsertNoteToTreeModal
        mode="project"
        open
        noteTitle={request.title}
        noteContent={request.content}
        onCancel={request.close}
        onSuccess={item => (item ? request.settle(item.id) : request.close())}
      />
    );
  if (request.action === "present")
    return <PresentationMode content={request.content} onExit={request.close} />;
  if (request.action === "share") return <ShareAction request={request} />;
  if (request.format === "image")
    return <ContentExportModal open onClose={request.close} content={request.content} />;
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

function ShareAction({ request }: { request: PluginContentActionRequest }) {
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
