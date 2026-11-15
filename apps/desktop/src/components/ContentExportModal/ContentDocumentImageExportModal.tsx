import { useLayoutEffect, type ComponentProps } from "react";
import type { ContentSessionTarget } from "@tau/collaboration";
import { Editor, EditorThemeOverride, type EditorRef } from "@tau/editor";
import type { NodeTreeEditor } from "@tau/editor-collab";
import { Loading } from "@tau/ui";
import useContentDocument from "@/hooks/useContentDocument";
import { useCollaborationKit } from "@/hooks/useCollaborationKit";
import ContentExportModal, { type ImageExportPreviewProps } from "./index";

export function ContentDocumentImageExportModal({
  source,
  ...props
}: Omit<ComponentProps<typeof ContentExportModal>, "renderPreview"> & {
  source?: ContentSessionTarget;
}) {
  return (
    <ContentExportModal
      {...props}
      renderPreview={preview =>
        source && <ContentDocumentPreview key={source.contentId} source={source} {...preview} />
      }
    />
  );
}

function ContentDocumentPreview({
  source,
  themeKey,
  mode,
  onReadyChange,
}: ImageExportPreviewProps & { source: ContentSessionTarget }) {
  const { contentId, ...owner } = source;
  const { document, binding, swapping, frozen, error, sessionError } = useContentDocument(
    contentId,
    owner,
    { readonlyPreview: true }
  );
  const kit = useCollaborationKit(binding);
  const loadError = sessionError || ((!document || frozen) && error);
  const ready = Boolean(document && !swapping && !frozen && !loadError);
  useLayoutEffect(() => {
    if (!ready) return;
    onReadyChange(true);
    return () => onReadyChange(false);
  }, [ready, onReadyChange]);

  if (loadError) {
    return (
      <div role="alert" className="text-danger text-tau-body py-8 text-center">
        {loadError}
      </div>
    );
  }
  if (!document) return <Loading minHeight={160} />;
  return (
    <EditorThemeOverride mode={mode} themeKey={themeKey}>
      <Editor kit={kit} document={document} ref={attachPreviewEditor} readonly />
    </EditorThemeOverride>
  );
}

function attachPreviewEditor(view: EditorRef | null) {
  if (!view) return;
  const element = view.getEditableElement();
  const editor = view.getEditor() as NodeTreeEditor;
  // 保活和严格模式也会清理 ref，等预览的 DOM 真正移除后才释放编辑器。
  return () => {
    queueMicrotask(() => {
      if (!element?.isConnected) editor.disposeNodeTree();
    });
  };
}
