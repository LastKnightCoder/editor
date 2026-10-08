import { Editor } from "@tau/editor";
import { useWhiteboardHost, type WhiteboardEditorProps } from "../host";
export default function HostContentEditor({
  contentId,
  editingContext,
  ...props
}: WhiteboardEditorProps) {
  const { slots, services } = useWhiteboardHost();
  if (slots.Editor)
    return <slots.Editor contentId={contentId} editingContext={editingContext} {...props} />;
  return <Editor {...props} kit={services.getContentKit(contentId)} />;
}
