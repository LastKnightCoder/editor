import { memo, useEffect, useRef, useState } from "react";
import Editor, { EditorRef } from "@/components/Editor";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import { getLogById, LogEntry, updateLog } from "@/commands/log";
import { useRafInterval, useUnmount } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import { Descendant } from "slate";

const LogEditor = memo(() => {
  const { activeLogId } = useLifeViewStore();
  const [log, setLog] = useState<LogEntry | null>(null);
  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();
  const latestContentRef = useRef<Descendant[]>([]);

  useEffect(() => {
    if (activeLogId) getLogById(activeLogId).then(setLog);
  }, [activeLogId]);

  useRafInterval(async () => {
    if (!log) return;
    const content = latestContentRef.current || log.content;
    await updateLog({ id: log.id, content });
  }, 1000);

  useUnmount(async () => {
    if (!log) return;
    const content = latestContentRef.current || log.content;
    await updateLog({ id: log.id, content });
  });

  if (!log) return null;

  return (
    <Editor
      ref={editorRef}
      initValue={log.content}
      onChange={(v) => {
        latestContentRef.current = v;
      }}
      uploadResource={uploadResource}
    />
  );
});

export default LogEditor;
