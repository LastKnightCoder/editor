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
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  Activity,
} from "react";
import type { Editor as CodeMirrorEditor } from "codemirror";
import type { Descendant } from "slate";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/mode/gfm/gfm.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/mode/yaml-frontmatter/yaml-frontmatter.js";
import { useThrottleFn } from "ahooks";
import { Code2 } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import { ErrorBoundary, Loading, cn, useEdgeFade, FADE_SCROLL_CLASS } from "@tau/ui";
import ContentExportModal from "@/components/ContentExportModal";
import { SnapshotImagePreview } from "@/components/ContentExportModal/SnapshotImagePreview";
import { useFindSource, type FindSource } from "@/components/GlobalFindBar/findOwner";
import {
  ContentOutline,
  extractContentHeaders,
  resolveEditorHeaderAnchor,
  type OutlineHeader,
} from "@/components/ContentOutline";
import { getContentLength, importFromMarkdown } from "@/utils";
import { SYMMETRIC_PAGE_GRID_STYLE } from "@/utils/pageMargin";
import { FileBanner, FileStatusBar } from "../FileChrome";
import { useTextFileSession } from "../useTextFileSession";
import type { FileViewStatus, MarkdownViewHandle } from "../types";
import { CodeMirrorView } from "./CodeMirrorView";
import { useMarkdownEditorServices } from "./editorServices";
import { useSourceMode } from "./useSourceMode";
import { createMarkdownDocument } from "./markdownDocument";
import { createContentLengthCounter } from "./contentLength";
import { createMarkdownContentPreparer } from "./prepareMarkdownContent";
import { isolatePreviewContent } from "./imagePreviewContent";
import { MarkdownViewportSurface } from "./MarkdownViewportSurface";
import { MarkdownSelectionCount } from "./MarkdownSelectionCount";
import { createMarkdownViewport, needsMarkdownViewport } from "./markdownViewport";
import { createRichFind, emptyFindResults, findSourceText } from "./markdownFind";

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
    /** 大纲贴正文右缘常驻（页面按右留白宽度判定）；不够宽时由页面降级为弹层 */
    outlineColumn?: boolean;
    onStatus(status: FileViewStatus): void;
    onOpenMarkdown(path: string): void;
    onSaveAs(text: string): void;
  }
>(function MarkdownFileView(
  { path, outlineColumn = false, onStatus, onOpenMarkdown, onSaveAs },
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
  const [viewportReady, setViewportReady] = useState(false);
  const markdownKit = useMarkdownEditorServices(path, onOpenMarkdown);
  const [fileDocument] = useState(() =>
    createMarkdownDocument(
      children => (
        <Activity mode={surfaceActive.current ? "visible" : "hidden"}>{children}</Activity>
      ),
      createMarkdownContentPreparer(markdownKit)
    )
  );
  const snapshot = useSyncExternalStore(fileDocument.subscribe, fileDocument.getSnapshot);
  const content = snapshot.content;
  const [viewport] = useState(createMarkdownViewport);
  const useViewportRef = useRef<boolean | null>(null);
  if (useViewportRef.current === null && snapshot.loaded && !snapshot.error) {
    useViewportRef.current = needsMarkdownViewport(content);
  }
  const useViewport = useViewportRef.current === true;
  const richReady = !useViewport || viewportReady;
  const sourceWindowedRef = useRef<boolean | null>(null);
  if (sourceWindowedRef.current === null && snapshot.loaded) {
    sourceWindowedRef.current =
      snapshot.text.length > 80_000 || snapshot.text.split("\n", 2001).length > 2000;
  }
  const sourceWindowed = sourceWindowedRef.current === true;
  const [sourceScroller, setSourceScroller] = useState<HTMLElement | null>(null);
  const [imageExportTitle, setImageExportTitle] = useState<string | null>(null);
  const imageExportOpen = imageExportTitle !== null;
  const imagePreviewScope = `image-export-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const unprojectedMarkdown = snapshot.error ? snapshot.text : null;
  const imagePreview = useMemo(() => {
    if (!imageExportOpen) return [];
    const nodes = unprojectedMarkdown === null ? content : importFromMarkdown(unprojectedMarkdown);
    return isolatePreviewContent(nodes, imagePreviewScope, type =>
      markdownKit.assembly.hasElement(type)
    );
  }, [imageExportOpen, content, unprojectedMarkdown, imagePreviewScope, markdownKit]);
  const getText = useCallback(() => fileDocument.getText(), [fileDocument]);
  const applySource = useCallback(
    (text: string, parsed: Descendant[]) => fileDocument.applyMarkdown(text, "user", parsed),
    [fileDocument]
  );
  const prepareRichTarget = useCallback(
    (index: number) => {
      const editor = editorRef.current?.getEditor();
      const node = editor?.children[index];
      if (!editor || !node) return;
      viewport.prepare(editor, [index]);
    },
    [viewport]
  );

  const { sourceMode, sourceCreated, toggle, showSource, sourceEditorRef, sourceTextRef } =
    useSourceMode({
      editorRef,
      getText,
      applySource,
      stopCapturing: fileDocument.stopCapturing,
      richReady,
      prepareRichTarget: useViewport ? prepareRichTarget : undefined,
      scrollEl,
      sourceWindowed,
    });
  const sourceModeRef = useRef(sourceMode);
  sourceModeRef.current = sourceMode;
  surfaceActive.current = (!sourceMode || !richReady) && !snapshot.error;

  const [findRichText] = useState(createRichFind);
  const findSource = useMemo<FindSource>(() => {
    if (sourceMode)
      return {
        search(query) {
          const code = sourceEditorRef.current;
          return code
            ? findSourceText(code, query, sourceWindowed ? null : scrollEl)
            : emptyFindResults;
        },
        subscribe(listener) {
          const code = sourceEditorRef.current;
          code?.on("change", listener);
          return () => {
            code?.off("change", listener);
          };
        },
      };
    return {
      search(query) {
        const editor = editorRef.current?.getEditor();
        return richReady && editor
          ? findRichText(editor, query, useViewport ? viewport : undefined, scrollEl)
          : emptyFindResults;
      },
      subscribe: fileDocument.subscribe,
    };
  }, [
    fileDocument,
    findRichText,
    richReady,
    scrollEl,
    sourceEditorRef,
    sourceMode,
    sourceWindowed,
    useViewport,
    viewport,
  ]);
  useFindSource(findSource);

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
    const text = fileDocument.getText();
    sourceTextRef.current = text;
    if (!sourceMode) return;
    const editor = sourceEditorRef.current;
    if (editor && editor.getValue() !== text) {
      const cursor = editor.getCursor();
      editor.setValue(text);
      editor.clearHistory();
      const line = Math.min(cursor.line, editor.lastLine());
      editor.setCursor({ line, ch: Math.min(cursor.ch, editor.getLine(line).length) });
    }
  }, [snapshot, fileDocument, sourceEditorRef, sourceTextRef, sourceMode]);
  useEffect(() => {
    if (snapshot.error && !sourceMode) showSource();
  }, [snapshot.error, sourceMode, showSource]);

  /* 字数 / 源码大纲：节流更新 */
  const [words, setWords] = useState(0);
  const [countContentLength] = useState(createContentLengthCounter);
  const [source, setSource] = useState<{ headers: OutlineHeader[]; lines: number[] }>({
    headers: [],
    lines: [],
  });
  const { run: refreshStats } = useThrottleFn(
    () => {
      if (sourceModeRef.current) {
        const sourceText = sourceTextRef.current;
        const projected = fileDocument.getSnapshot();
        setWords(
          projected.error
            ? getContentLength([{ type: "formatted", text: sourceText }])
            : countContentLength(projected.content)
        );
        setSource(sourceHeaders(sourceText));
      } else {
        setWords(
          countContentLength(
            editorRef.current?.getEditor().children ?? fileDocument.getSnapshot().content
          )
        );
      }
    },
    { wait: 1000 }
  );
  useEffect(() => refreshStats(), [content, sourceMode, refreshStats]);

  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null);
  const richRef = useRef<HTMLDivElement>(null);

  /* 大纲：富文本按顶层标题节点定位；源码按行定位（ContentOutline 只读锚点的 rect） */
  const richHeaders = useMemo(() => extractContentHeaders(content ?? []), [content]);
  const headingIndexes = useMemo(
    () =>
      useViewport ? content.flatMap((node, index) => (node.type === "header" ? [index] : [])) : [],
    [content, useViewport]
  );
  const resolveAnchor = useCallback(
    (_header: OutlineHeader, index: number): HTMLElement | null => {
      if (!sourceModeRef.current) {
        const editor = editorRef.current?.getEditor();
        const node = editor?.children[headingIndexes[index]];
        return (
          (editor && node ? viewport.anchor(editor, node) : null) ??
          resolveEditorHeaderAnchor(editor, index)
        );
      }
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
    [source.lines, sourceEditorRef, headingIndexes, viewport]
  );

  const dirty = session.saveState === "dirty" || session.conflict !== null || session.missing;
  const headers = sourceMode ? source.headers : richHeaders;
  const outlineAnchorScroll = sourceMode && sourceWindowed ? sourceScroller : scrollEl;
  useEffect(() => {
    onStatus({
      dirty,
      sourceMode,
      outline: { headers, scrollEl: outlineAnchorScroll, resolveAnchor },
    });
  }, [dirty, onStatus, resolveAnchor, headers, outlineAnchorScroll, sourceMode]);

  /* sheet 够宽时大纲贴正文右缘常驻（grid 三列，正文列让位）；不够宽由页面降级为弹层 */
  const outlineAsColumn = outlineColumn && headers.length > 0;
  const outlineNode = (
    <ContentOutline
      headers={headers}
      scrollEl={outlineAnchorScroll}
      resolveAnchor={resolveAnchor}
      className="w-full"
    />
  );

  const getContent = useCallback(() => fileDocument.getContent(), [fileDocument]);
  const openImageExport = useCallback(
    (title: string) => {
      if (!fileDocument.getSnapshot().loaded) return;
      fileDocument.flushEditorChanges();
      setImageExportTitle(title);
    },
    [fileDocument]
  );

  useImperativeHandle(
    ref,
    () => ({
      flush: session.flush,
      toggleSource: toggle,
      getMarkdown: getText,
      getContent,
      openImageExport,
    }),
    [getContent, getText, openImageExport, session.flush, toggle]
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
      if (sourceWindowed) setSourceScroller(editor?.getScrollerElement() ?? null);
      if (editor && snapshot.loaded) {
        const text = fileDocument.getText();
        if (editor.getValue() !== text) editor.setValue(text);
      }
    },
    [sourceEditorRef, fileDocument, snapshot.loaded, sourceWindowed]
  );

  if (session.loadError) {
    return (
      <div className="text-tau-meta text-ink-2 grid flex-1 place-items-center px-8 text-center">
        无法读取文件：{session.loadError}
      </div>
    );
  }
  if (!snapshot.loaded) return <Loading />;

  const sourceView = (
    <div className={cn(!sourceMode && "hidden")}>
      {sourceCreated && (
        <CodeMirrorView
          value={sourceTextRef.current}
          mode={SOURCE_MODE}
          scrollEl={scrollEl}
          windowHeight={sourceWindowed ? Math.max(160, (outlineMaxH ?? 520) - 88) : undefined}
          onMount={onSourceMount}
          onSave={() => void session.save()}
          onUndo={fileDocument.undo}
          onRedo={fileDocument.redo}
          onCursorChange={setCursor}
          onChange={(text, origin) => {
            sourceTextRef.current = text;
            if (origin === "setValue") return;
            fileDocument.editSource(text);
            markDirty();
            refreshStats();
          }}
        />
      )}
    </div>
  );
  const richView = (
    <div ref={richRef} className={cn((sourceMode || !!snapshot.error) && "hidden")}>
      {useViewport ? (
        <MarkdownViewportSurface
          kit={markdownKit}
          editorRef={editorRef}
          document={fileDocument.document}
          content={content}
          scrollEl={scrollEl}
          suspended={sourceMode || !!snapshot.error}
          viewport={viewport}
          onReadyChange={setViewportReady}
        />
      ) : (
        <div data-markdown-full-editor="ready">
          <ErrorBoundary>
            <Editor
              kit={markdownKit}
              ref={editorRef}
              document={fileDocument.document}
              readonly={sourceMode || !!snapshot.error}
              ariaLabel="Markdown 正文"
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );

  return (
    <>
      <ContentExportModal
        open={imageExportOpen}
        onClose={() => setImageExportTitle(null)}
        title={imageExportTitle ?? undefined}
        renderPreview={preview => (
          <SnapshotImagePreview {...preview} content={imagePreview} kit={markdownKit} />
        )}
      />
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
      <div ref={setScrollEl} className={cn(FADE_SCROLL_CLASS, "@container min-h-0 flex-1")}>
        <div className="grid min-h-full" style={SYMMETRIC_PAGE_GRID_STYLE}>
          <div className="col-start-2 min-w-0 pt-8 pb-24">
            {sourceView}
            {richView}
          </div>
          {outlineAsColumn && (
            <div className="col-start-3 min-w-0 pt-8 pr-4 pl-6">
              <div
                ref={setOutlineScrollEl}
                className={cn(
                  FADE_SCROLL_CLASS,
                  "sticky top-8 -mr-2 max-w-[240px] overflow-y-auto overscroll-y-contain pr-2"
                )}
                style={{ maxHeight: outlineMaxH ?? undefined }}
              >
                {outlineNode}
              </div>
            </div>
          )}
        </div>
      </div>
      <FileStatusBar cursor={sourceMode ? cursor : null} saveState={session.saveState}>
        <button
          type="button"
          onClick={toggle}
          onMouseDown={event => {
            if (event.button === 0) event.preventDefault();
          }}
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
        {!sourceMode && (
          <MarkdownSelectionCount
            editorRef={editorRef}
            richRef={richRef}
            useViewport={useViewport}
          />
        )}
      </FileStatusBar>
    </>
  );
});
