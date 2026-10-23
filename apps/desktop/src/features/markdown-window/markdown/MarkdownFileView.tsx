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
  useSyncExternalStore,
  Activity,
} from "react";
import type { Editor as CodeMirrorEditor } from "codemirror";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/mode/gfm/gfm.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/mode/yaml-frontmatter/yaml-frontmatter.js";
import { useThrottleFn } from "ahooks";
import { Code2 } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import { Loading, cn, useEdgeFade, FADE_SCROLL_CLASS } from "@tau/ui";
import { ErrorBoundary } from "@tau/ui";
import {
  ContentOutline,
  extractContentHeaders,
  resolveEditorHeaderAnchor,
  type OutlineHeader,
} from "@/components/ContentOutline";
import { getContentLength, importFromMarkdown } from "@/utils";
import { FileBanner, FileStatusBar } from "../FileChrome";
import { useTextFileSession } from "../useTextFileSession";
import type { FileViewStatus, MarkdownViewHandle } from "../types";
import { CodeMirrorView } from "./CodeMirrorView";
import { useMarkdownEditorServices } from "./editorServices";
import { useSourceMode } from "./useSourceMode";
import { createMarkdownDocument } from "./markdownDocument";

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
    /** 大纲贴正文右缘常驻（页面按 sheet 宽度判定）；不够宽时由页面降级为弹层 */
    outlineColumn?: boolean;
    onStatus(status: FileViewStatus): void;
    onOpenMarkdown(path: string): void;
    onSaveAs(text: string): void;
  }
>(function MarkdownFileView(
  { path, wide, outlineColumn = false, onStatus, onOpenMarkdown, onSaveAs },
  ref
) {
  const editorRef = useRef<EditorRef>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  /* 大纲超高时独立滚动：上限 = 正文滚动容器高 − 40（top-8 + 底部留白），触边不带动正文 */
  const [outlineScrollEl, setOutlineScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(outlineScrollEl);
  const [outlineMaxH, setOutlineMaxH] = useState<number | null>(null);
  useEffect(() => {
    if (!scrollEl) return;
    const observer = new ResizeObserver(() =>
      setOutlineMaxH(Math.max(0, scrollEl.clientHeight - 40))
    );
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);

  const surfaceActive = useRef(true);
  const [fileDocument] = useState(() =>
    createMarkdownDocument(children => (
      <Activity mode={surfaceActive.current ? "visible" : "hidden"}>{children}</Activity>
    ))
  );
  const snapshot = useSyncExternalStore(fileDocument.subscribe, fileDocument.getSnapshot);
  const content = snapshot.content;
  const getText = useCallback(() => fileDocument.getText(), [fileDocument]);
  const applySource = useCallback(
    (text: string) => fileDocument.applyMarkdown(text, "user"),
    [fileDocument]
  );

  const { sourceMode, toggle, showSource, sourceEditorRef, sourceTextRef } = useSourceMode({
    editorRef,
    getText,
    applySource,
    stopCapturing: fileDocument.stopCapturing,
  });
  const sourceModeRef = useRef(sourceMode);
  sourceModeRef.current = sourceMode;
  surfaceActive.current = !sourceMode && !snapshot.error;

  const applyExternalText = useCallback(
    (text: string) => {
      fileDocument.applyMarkdown(text, "external");
    },
    [fileDocument]
  );

  const session = useTextFileSession({ path, getText, applyExternalText, ready: snapshot.loaded });
  const { markDirty, flush, save } = session;

  // 首次读到文件
  useEffect(() => {
    if (session.initialText !== null && !snapshot.loaded) applyExternalText(session.initialText);
  }, [applyExternalText, snapshot.loaded, session.initialText]);

  useEffect(
    () =>
      fileDocument.onChange(source => {
        if (source === "user") markDirty();
      }),
    [fileDocument, markDirty]
  );
  const lifetime = useRef({ revision: 0 });
  useEffect(() => {
    const tracker = lifetime.current;
    const revision = ++tracker.revision;
    return () => {
      queueMicrotask(async () => {
        if (tracker.revision !== revision) return;
        await flush();
        if (tracker.revision === revision) fileDocument.dispose();
      });
    };
  }, [fileDocument, flush]);

  useEffect(() => {
    sourceTextRef.current = snapshot.text;
    const editor = sourceEditorRef.current;
    if (editor && editor.getValue() !== snapshot.text) {
      const cursor = editor.getCursor();
      editor.setValue(snapshot.text);
      editor.clearHistory();
      const line = Math.min(cursor.line, editor.lastLine());
      editor.setCursor({ line, ch: Math.min(cursor.ch, editor.getLine(line).length) });
    }
  }, [snapshot.text, sourceEditorRef, sourceTextRef]);
  useEffect(() => {
    if (snapshot.error && !sourceMode) showSource();
  }, [snapshot.error, sourceMode, showSource]);

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
        const sourceText = sourceTextRef.current;
        const sourceContent = fileDocument.getSnapshot().error
          ? [{ type: "formatted" as const, text: sourceText }]
          : importFromMarkdown(sourceText);
        setWords(getContentLength(sourceContent));
        setSource(sourceHeaders(sourceTextRef.current));
      } else {
        setWords(getContentLength(fileDocument.getContent()));
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
  const headers = sourceMode ? source.headers : richHeaders;
  useEffect(() => {
    onStatus({
      dirty,
      sourceMode,
      outline: { headers, scrollEl, resolveAnchor },
    });
  }, [dirty, onStatus, resolveAnchor, headers, scrollEl, sourceMode]);

  /* sheet 够宽时大纲贴正文右缘常驻（grid 三列，正文列让位）；不够宽由页面降级为弹层 */
  const outlineAsColumn = outlineColumn && headers.length > 0;
  const outlineNode = (
    <ContentOutline
      headers={headers}
      scrollEl={scrollEl}
      resolveAnchor={resolveAnchor}
      className="w-full"
    />
  );

  const getContent = useCallback(() => fileDocument.getContent(), [fileDocument]);

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
        void save();
      } else if (event.key === "/") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, toggle]);

  const onSourceMount = useCallback(
    (editor: CodeMirrorEditor | null) => {
      sourceEditorRef.current = editor;
      if (editor && snapshot.loaded) editor.setValue(fileDocument.getText());
    },
    [sourceEditorRef, fileDocument, snapshot.loaded]
  );

  if (session.loadError) {
    return (
      <div className="text-tau-meta text-ink-2 grid flex-1 place-items-center px-8 text-center">
        无法读取文件：{session.loadError}
      </div>
    );
  }
  if (!snapshot.loaded) return <Loading />;

  const column = cn("mx-auto w-full px-10 pb-24 pt-8", wide ? "max-w-[1040px]" : "max-w-[800px]");

  const sourceView = (
    <div className={cn(!sourceMode && "hidden")}>
      <CodeMirrorView
        value={sourceTextRef.current}
        mode={SOURCE_MODE}
        scrollEl={scrollEl}
        onMount={onSourceMount}
        onSave={() => void session.save()}
        onUndo={fileDocument.undo}
        onRedo={fileDocument.redo}
        onCursorChange={setCursor}
        onChange={(text, origin) => {
          sourceTextRef.current = text;
          if (origin === "setValue") return;
          applySource(text);
          refreshStats();
        }}
      />
    </div>
  );
  const richView = (
    <div ref={richRef} className={cn((sourceMode || !!snapshot.error) && "hidden")}>
      <ErrorBoundary>
        <Editor
          kit={markdownKit}
          ref={editorRef}
          document={fileDocument.document}
          readonly={sourceMode || !!snapshot.error}
        />
      </ErrorBoundary>
    </div>
  );

  return (
    <>
      {snapshot.error && (
        <FileBanner tone="warn" actions={[]}>
          暂时无法显示富文本，原文已保留，可继续编辑和保存源码：{snapshot.error}
        </FileBanner>
      )}
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
        {outlineAsColumn ? (
          <div
            className={cn(
              "grid min-h-full",
              wide
                ? "grid-cols-[minmax(0,1fr)_minmax(0,1040px)_minmax(208px,1fr)]"
                : "grid-cols-[minmax(0,1fr)_minmax(0,800px)_minmax(208px,1fr)]"
            )}
          >
            <div className="col-start-2 min-w-0 px-10 pb-24 pt-8">
              {sourceView}
              {richView}
            </div>
            {/* 起始与正文同高（同正文列 pt-8），滚动后吸在同一留白处；超高独立滚动 */}
            <div className="col-start-3 min-w-0 pl-4 pr-3 pt-8">
              <div
                ref={setOutlineScrollEl}
                className={cn(
                  FADE_SCROLL_CLASS,
                  "sticky top-8 max-w-[240px] overflow-y-auto overscroll-y-contain"
                )}
                style={{ maxHeight: outlineMaxH ?? undefined }}
              >
                {outlineNode}
              </div>
            </div>
          </div>
        ) : (
          <div className={column}>
            {sourceView}
            {richView}
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
