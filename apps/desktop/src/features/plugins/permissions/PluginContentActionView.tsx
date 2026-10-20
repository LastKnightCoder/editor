import { useEffect, useRef } from "react";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import PresentationMode from "@/components/PresentationMode";
import ContentCollaborationControl, {
  type ContentCollaborationControlHandle,
} from "@/components/ContentCollaborationControl";
import type { PluginActionRequest } from "@/app/plugins/app";

/** 与卡片详情「导出 / 演示 / 发起协作」同一组宿主组件；关闭即撤下请求 */
export default function PluginContentActionView({ request }: { request: PluginActionRequest }) {
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

function ShareAction({ request }: { request: PluginActionRequest }) {
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
