/**
 * Markdown 文件视图：富文本（@tau/editor）与源码（CodeMirror）两种模式，一个视图实例对应一个文件
 * （页面按路径 key 重建），保存 / 外部修改由 useTextFileSession 负责。
 *
 * 导入再序列化的 Markdown 可能与原文有格式差异：当前内容序列化后等于「原文的归一化结果」时
 * 视为未修改、按原文保存（即不写），只打开不修改不会改写文件。
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Descendant } from "slate";
import type { Editor as CodeMirrorEditor } from "codemirror";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/mode/gfm/gfm.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/mode/yaml-frontmatter/yaml-frontmatter.js";
import { useThrottleFn } from "ahooks";
import { Code2 } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import { Loading, cn, useEdgeFade, FADE_SCROLL_CLASS } from "@tau/ui";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  extractContentHeaders,
  resolveEditorHeaderAnchor,
  type OutlineHeader,
} from "@/components/ContentOutline";
import { getContentLength, getMarkdown, importFromMarkdown } from "@/utils";
import { FileBanner, FileStatusBar } from "../FileChrome";
import { useTextFileSession } from "../useTextFileSession";
import type { FileViewStatus, MarkdownViewHandle } from "../types";
import { CodeMirrorView } from "./CodeMirrorView";
import { useMarkdownEditorServices } from "./editorServices";
import { useSourceMode } from "./useSourceMode";

const WORDS_PER_MINUTE = 400;
const SOURCE_MODE = { name: "yaml-frontmatter", base: "gfm" };

/** 源码里的 ATX 标题（跳过代码围栏内的行） */
function sourceHeaders(text: string): { headers: OutlineHeader[]; lines: number[] } {
  const headers: OutlineHeader[] = [];
  const lines: number[] = [];
  let fenced = false;
  text.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    headers.push({ id: `source-h-${index}`, level: match[1].length, title: match[2] });
    lines.push(index);
  });
  return { headers, lines };
}

export const MarkdownFileView = forwardRef<
  MarkdownViewHandle,
  {
    path: string;
    wide: boolean;
    onStatus(status: FileViewStatus): void;
    onOpenMarkdown(path: string): void;
    onSaveAs(text: string): void;
  }
>(function MarkdownFileView({ path, wide, onStatus, onOpenMarkdown, onSaveAs }, ref) {
  const editorRef = useRef<EditorRef>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  const [content, setContent] = useState<Descendant[] | null>(null);
  const contentRef = useRef<Descendant[]>([]);
  contentRef.current = content ?? [];
  /** 载入 / 外部同步时的原文与它的归一化结果 */
  const loadedText = useRef("");
  const loadedNormalized = useRef("");
  const setLoaded = (text: string, nodes: Descendant[]) => {
    loadedText.current = text;
    loadedNormalized.current = getMarkdown(nodes);
  };

  const { sourceMode, toggle, sourceEditorRef, sourceTextRef } = useSourceMode({
    editorRef,
    getContent: () => contentRef.current,
    setContent,
  });
  const sourceModeRef = useRef(sourceMode);
  sourceModeRef.current = sourceMode;

  const getText = useCallback(() => {
    const text = sourceModeRef.current ? sourceTextRef.current : getMarkdown(contentRef.current);
    return text === loadedNormalized.current ? loadedText.current : text;
  }, [sourceTextRef]);

  const applyExternalText = useCallback(
    (text: string) => {
      const nodes = importFromMarkdown(text);
      setLoaded(text, nodes);
      sourceTextRef.current = text;
      setContent(nodes);
      editorRef.current?.setEditorValue(nodes);
      sourceEditorRef.current?.setValue(text);
    },
    [sourceEditorRef, sourceTextRef]
  );

  const session = useTextFileSession({ path, getText, applyExternalText });

  // 首次读到文件
  useEffect(() => {
    if (session.initialText === null || content !== null) return;
    const nodes = importFromMarkdown(session.initialText);
    setLoaded(session.initialText, nodes);
    sourceTextRef.current = session.initialText;
    setContent(nodes);
  }, [content, session.initialText, sourceTextRef]);

  const markdownKit = useMarkdownEditorServices(path, onOpenMarkdown);

  /* 字数 / 源码大纲：节流更新 */
  const [words, setWords] = useState(0);
  const [source, setSource] = useState<{ headers: OutlineHeader[]; lines: number[] }>({
    headers: [],
    lines: [],
  });
  const { run: refreshStats } = useThrottleFn(
    () => {
      if (sourceModeRef.current) {
        setWords(getContentLength(importFromMarkdown(sourceTextRef.current)));
        setSource(sourceHeaders(sourceTextRef.current));
      } else {
        setWords(getContentLength(contentRef.current));
      }
    },
    { wait: 1000 }
  );
  useEffect(() => refreshStats(), [content, sourceMode, refreshStats]);

  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null);
  const [selectedWords, setSelectedWords] = useState(0);
  const richRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const inside = Boolean(
        selection?.anchorNode && richRef.current?.contains(selection.anchorNode)
      );
      const text = inside && selection && !selection.isCollapsed ? selection.toString() : "";
      setSelectedWords(text ? getContentLength([{ type: "formatted", text }]) : 0);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  /* 大纲：富文本按顶层标题节点定位；源码按行定位（ContentOutline 只读锚点的 rect） */
  const richHeaders = useMemo(() => extractContentHeaders(content ?? []), [content]);
  const resolveAnchor = useCallback(
    (_header: OutlineHeader, index: number): HTMLElement | null => {
      if (!sourceModeRef.current)
        return resolveEditorHeaderAnchor(editorRef.current?.getEditor(), index);
      const editor = sourceEditorRef.current;
      const line = source.lines[index];
      if (!editor || line === undefined) return null;
      return {
        getBoundingClientRect: () => {
          const coords = editor.charCoords({ line, ch: 0 }, "window");
          return { top: coords.top, bottom: coords.bottom } as DOMRect;
        },
      } as HTMLElement;
    },
    [source.lines, sourceEditorRef]
  );

  const dirty = session.saveState === "dirty" || session.conflict !== null || session.missing;
  useEffect(() => {
    onStatus({
      dirty,
      sourceMode,
      outline: { headers: sourceMode ? source.headers : richHeaders, scrollEl, resolveAnchor },
    });
  }, [dirty, onStatus, resolveAnchor, richHeaders, scrollEl, source.headers, sourceMode]);

  const getContent = useCallback(
    () => (sourceModeRef.current ? importFromMarkdown(sourceTextRef.current) : contentRef.current),
    [sourceTextRef]
  );

  useImperativeHandle(
    ref,
    () => ({ flush: session.flush, toggleSource: toggle, getMarkdown: getText, getContent }),
    [getContent, getText, session.flush, toggle]
  );

  // ⌘S 立即保存（源码模式由 CodeMirror 自己的键位处理）；⌘/ 切换源码
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key === "s" && !sourceModeRef.current) {
        event.preventDefault();
        void session.save();
      } else if (event.key === "/") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session.save, toggle]);

  const onSourceMount = useCallback(
    (editor: CodeMirrorEditor | null) => {
      sourceEditorRef.current = editor;
    },
    [sourceEditorRef]
  );

  if (session.loadError) {
    return (
      <div className="text-tau-meta text-ink-2 grid flex-1 place-items-center px-8 text-center">
        无法读取文件：{session.loadError}
      </div>
    );
  }
  if (content === null) return <Loading />;

  const column = cn("mx-auto w-full px-10 pb-24 pt-8", wide ? "max-w-[1040px]" : "max-w-[800px]");

  return (
    <>
      {session.conflict !== null && (
        <FileBanner
          tone="warn"
          actions={[
            { label: "载入外部版本", onClick: session.loadExternal },
            { label: "保留我的版本", primary: true, onClick: () => void session.keepMine() },
          ]}
        >
          文件已在外部修改，与你未保存的内容冲突
        </FileBanner>
      )}
      {session.missing && (
        <FileBanner
          tone="danger"
          actions={[
            { label: "重新保存", onClick: () => void session.resave() },
            { label: "另存为…", onClick: () => onSaveAs(getText()) },
          ]}
        >
          文件已不在磁盘上（被删除或移动），内容仍保留在窗口里
        </FileBanner>
      )}
      <div ref={setScrollEl} className={cn(FADE_SCROLL_CLASS, "min-h-0 flex-1")}>
        <div className={cn(column, !sourceMode && "hidden")}>
          <CodeMirrorView
            value={sourceTextRef.current}
            mode={SOURCE_MODE}
            scrollEl={scrollEl}
            onMount={onSourceMount}
            onSave={() => void session.save()}
            onCursorChange={setCursor}
            onChange={(text, origin) => {
              sourceTextRef.current = text;
              if (origin === "setValue") return;
              session.markDirty();
              refreshStats();
            }}
          />
        </div>
        {!sourceMode && (
          <div ref={richRef} className={column}>
            <ErrorBoundary>
              <Editor
                kit={markdownKit}
                ref={editorRef}
                initValue={content}
                onChange={value => {
                  // 仅选区变化时 children 引用不变：不算编辑
                  if (value === contentRef.current) return;
                  setContent(value);
                  session.markDirty();
                }}
                readonly={false}
              />
            </ErrorBoundary>
          </div>
        )}
      </div>
      <FileStatusBar cursor={sourceMode ? cursor : null} saveState={session.saveState}>
        <button
          type="button"
          onClick={toggle}
          title={sourceMode ? "退出源码模式 (⌘/)" : "源码模式 (⌘/)"}
          aria-pressed={sourceMode}
          className={cn(
            "grid h-5 w-[22px] place-items-center rounded-[6px] transition-colors",
            sourceMode
              ? "bg-selected text-accent-text"
              : "text-ink-3 hover:bg-hover hover:text-ink-1 opacity-70 hover:opacity-100"
          )}
        >
          <Code2 className="size-[13px]" strokeWidth={1.75} />
        </button>
        <span>
          <b className="text-ink-2 font-medium">{words.toLocaleString()}</b> 字
        </span>
        {words > 0 && <span>约 {Math.max(1, Math.round(words / WORDS_PER_MINUTE))} 分钟</span>}
        {!sourceMode && selectedWords > 0 && (
          <span>
            选中 <b className="text-ink-2 font-medium">{selectedWords.toLocaleString()}</b> 字
          </span>
        )}
      </FileStatusBar>
    </>
  );
});
