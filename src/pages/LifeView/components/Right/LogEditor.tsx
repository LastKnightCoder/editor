import { memo, useEffect, useRef, useState } from "react";
import Editor, { EditorRef } from "@/components/Editor";
import EditText, { EditTextHandle } from "@/components/EditText";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import { getLogById, LogEntry, updateLog } from "@/commands/log";
import { useRafInterval, useUnmount, useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import { Descendant } from "slate";
import { formatDate } from "@/utils";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  contentLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";

const extensions = [contentLinkExtension, fileAttachmentExtension];

const LogEditor = memo(() => {
  const { activeLogId, readonly } = useLifeViewStore();
  const [log, setLog] = useState<LogEntry | null>(null);
  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const uploadResource = useUploadResource();
  const latestContentRef = useRef<Descendant[]>([]);

  useEffect(() => {
    if (activeLogId) {
      getLogById(activeLogId)
        .then((logData) => {
          setLog(logData);
          if (logData && titleRef.current) {
            titleRef.current.setValue(logData.title);
          }
        })
        .catch((error) => {
          console.error("Failed to get log by id:", error);
          setLog(null);
        });
    } else {
      setLog(null);
    }
  }, [activeLogId]);

  const saveLog = useMemoizedFn(async () => {
    if (!log) return;
    const content = latestContentRef.current || log.content;
    await updateLog({ id: log.id, content, title: log.title });
  });

  useRafInterval(async () => {
    if (readonly || !log) return;
    await saveLog();
  }, 1000);

  useUnmount(async () => {
    if (readonly || !log) return;
    await saveLog();
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (log) {
      setLog({ ...log, title });
    }
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    latestContentRef.current = content;
  });

  const onPressEnter = useMemoizedFn(async () => {
    titleRef.current?.blur();
    editorRef.current?.focus();
    await saveLog();
  });

  if (!log) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        选择一个日志进行编辑
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 标题区域 */}
          <div>
            <EditText
              key={log.id}
              ref={titleRef}
              defaultValue={log.title}
              onChange={onTitleChange}
              contentEditable={!readonly}
              onPressEnter={onPressEnter}
              className="text-2xl font-bold"
            />
          </div>

          {/* 时间信息 */}
          <div className="text-sm text-gray-500">
            创建于 {formatDate(log.create_time, true)}
            {" · "}最后修改于 {formatDate(log.update_time, true)}
          </div>

          {/* 编辑器区域 */}
          <div className="min-h-96">
            <ErrorBoundary>
              <Editor
                key={log.id}
                ref={editorRef}
                initValue={
                  log.content && log.content.length > 0
                    ? log.content
                    : [
                        {
                          type: "paragraph",
                          children: [{ type: "formatted", text: "" }],
                        },
                      ]
                }
                onChange={onContentChange}
                uploadResource={uploadResource}
                readonly={readonly}
                extensions={extensions}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
});

export default LogEditor;
