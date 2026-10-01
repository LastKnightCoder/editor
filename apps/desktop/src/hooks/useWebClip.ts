import { useState, useRef, useEffect, useCallback } from "react";
import { useThrottleFn, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import { importFromMarkdown } from "@/utils/markdown";
import {
  startWebClip,
  cancelWebClip,
  getWebClipStatus,
  registerWebClipProgressHandler,
  registerWebClipCompleteHandler,
  registerWebClipErrorHandler,
  WebClipProgressData,
  WebClipCompleteData,
  WebClipErrorData,
} from "@/services/web-clip";

interface UseWebClipOptions {
  projectItemId: number;
  onProgress?: (markdown: string, content: Descendant[]) => void;
  onComplete?: (
    markdown: string,
    content: Descendant[],
    webClipId?: number,
    contentId?: number
  ) => void;
  onError?: (error: string) => void;
}

interface UseWebClipReturn {
  isClipping: boolean;
  markdown: string;
  content: Descendant[];
  error: string | null;
  startClip: (
    html: string,
    url: string,
    title: string,
    translateToChinese?: boolean
  ) => Promise<void>;
  cancelClip: () => Promise<void>;
  reset: () => void;
}

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

export const useWebClip = (options: UseWebClipOptions): UseWebClipReturn => {
  const { projectItemId, onProgress, onComplete, onError } = options;

  const [isClipping, setIsClipping] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [content, setContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [error, setError] = useState<string | null>(null);

  const requestVersion = useRef(0);
  const accepting = useRef(true);

  // 节流解析 markdown 为 content
  const { run: throttledParse, cancel: cancelParse } = useThrottleFn(
    (md: string) => {
      if (!accepting.current) return;
      try {
        const parsed = importFromMarkdown(md, ["yaml"]);
        if (parsed.length > 0) {
          setContent(parsed);
          onProgress?.(md, parsed);
        }
      } catch (err) {
        console.warn("Parse markdown error:", err);
      }
    },
    { wait: 100 }
  );

  // 处理进度通知
  const handleProgress = useMemoizedFn((data: WebClipProgressData) => {
    if (data.projectItemId !== projectItemId || !accepting.current) return;

    setMarkdown(data.markdown);
    throttledParse(data.markdown);
  });

  // 处理完成通知
  const handleComplete = useMemoizedFn((data: WebClipCompleteData) => {
    if (data.projectItemId !== projectItemId || !accepting.current) return;
    cancelParse();

    setIsClipping(false);
    setMarkdown(data.markdown);

    // 最终解析
    try {
      const parsed = importFromMarkdown(data.markdown, ["yaml"]);
      if (parsed.length > 0) {
        setContent(parsed);
        onComplete?.(data.markdown, parsed, data.webClipId, data.contentId);
      }
    } catch (err) {
      console.warn("Final parse markdown error:", err);
      setError("解析内容失败");
      onError?.("解析内容失败");
    }
  });

  // 处理错误通知
  const handleError = useMemoizedFn((data: WebClipErrorData) => {
    if (data.projectItemId !== projectItemId || !accepting.current) return;
    cancelParse();

    setIsClipping(false);
    setError(data.error);
    onError?.(data.error);
  });

  // 注册监听器
  useEffect(() => {
    const version = requestVersion;
    const request = ++requestVersion.current;
    accepting.current = true;
    const unregisterProgress = registerWebClipProgressHandler(handleProgress);
    const unregisterComplete = registerWebClipCompleteHandler(handleComplete);
    const unregisterError = registerWebClipErrorHandler(handleError);

    // 检查是否有正在进行的任务
    getWebClipStatus(projectItemId).then(status => {
      if (request !== requestVersion.current || !accepting.current) return;
      if (status && status.status === "processing") {
        setIsClipping(true);
        setMarkdown(status.markdown);
        if (status.markdown) {
          throttledParse(status.markdown);
        }
      }
    });

    return () => {
      version.current++;
      accepting.current = false;
      cancelParse();
      unregisterProgress();
      unregisterComplete();
      unregisterError();
    };
  }, [projectItemId, handleProgress, handleComplete, handleError, throttledParse, cancelParse]);

  // 开始解析
  const startClip = useMemoizedFn(
    async (html: string, url: string, title: string, translateToChinese = false) => {
      const request = ++requestVersion.current;
      accepting.current = true;
      cancelParse();
      setIsClipping(true);
      setError(null);
      setMarkdown("");
      setContent(DEFAULT_CONTENT);

      try {
        await startWebClip({
          projectItemId,
          html,
          url,
          title,
          translateToChinese,
        });
      } catch (err) {
        if (request !== requestVersion.current) return;
        setIsClipping(false);
        const errorMessage = err instanceof Error ? err.message : "开始解析失败";
        setError(errorMessage);
        onError?.(errorMessage);
      }
    }
  );

  // 取消解析
  const cancelClip = useCallback(async () => {
    requestVersion.current++;
    accepting.current = false;
    cancelParse();
    setIsClipping(false);
    try {
      await cancelWebClip(projectItemId);
    } catch (err) {
      console.error("Cancel web clip error:", err);
    }
  }, [projectItemId, cancelParse]);

  // 重置状态
  const reset = useCallback(() => {
    requestVersion.current++;
    accepting.current = false;
    cancelParse();
    setIsClipping(false);
    setMarkdown("");
    setContent(DEFAULT_CONTENT);
    setError(null);
  }, [cancelParse]);

  return {
    isClipping,
    markdown,
    content,
    error,
    startClip,
    cancelClip,
    reset,
  };
};

export default useWebClip;
