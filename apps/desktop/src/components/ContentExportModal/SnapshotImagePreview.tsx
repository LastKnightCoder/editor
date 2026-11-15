import { useLayoutEffect, useState } from "react";
import type { Descendant } from "slate";
import { Editor, EditorThemeOverride, type EditorKit } from "@tau/editor";
import type { ImageExportPreviewProps } from "./index";

export function SnapshotImagePreview({
  content,
  kit,
  themeKey,
  mode,
  onReadyChange,
}: ImageExportPreviewProps & { content: Descendant[]; kit: EditorKit }) {
  const [snapshot, setSnapshot] = useState({ content, revision: 0 });
  // initValue 只在新编辑器实例中生效。
  if (snapshot.content !== content) setSnapshot({ content, revision: snapshot.revision + 1 });

  useLayoutEffect(() => {
    onReadyChange(true);
    return () => onReadyChange(false);
  }, [onReadyChange]);

  return (
    <EditorThemeOverride mode={mode} themeKey={themeKey}>
      <Editor key={snapshot.revision} kit={kit} initValue={snapshot.content} readonly />
    </EditorThemeOverride>
  );
}
