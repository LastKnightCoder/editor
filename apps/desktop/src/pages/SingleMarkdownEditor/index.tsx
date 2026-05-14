import { useEffect, useMemo, useRef, useState } from "react";
import {
  Descendant,
  Transforms,
  Editor as SlateEditor,
  Text,
  Element as SlateElement,
} from "slate";
import { ReactEditor } from "slate-react";
import { useSearchParams } from "react-router-dom";
import {
  message,
  Button,
  Tooltip,
  Modal,
  Dropdown,
  type MenuProps,
} from "antd";

import {
  Editor,
  EditorRef,
  EditorServicesProvider,
  useEditorServices,
} from "@tau/editor/src";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";
import { Editor as CodeMirrorEditor, EditorChange } from "codemirror";
import isHotkey from "is-hotkey";

import {
  readTextFile,
  writeTextFile,
  writeBinaryFile,
  getDirectoryName,
  resolvePathFrom,
  pathExists,
  isDirectory,
  openFileWithDefaultApp,
  watchTextFile,
  unwatchTextFile,
  onTextFileChanged,
  offTextFileChanged,
  getSep,
  compressImage,
  type TextFileChangedPayload,
  openExternal,
} from "@/commands";
import {
  useMemoizedFn,
  useRafInterval,
  useThrottleFn,
  useUnmount,
  useLocalStorageState,
} from "ahooks";
import { importFromMarkdown, getMarkdown } from "@/utils";
import { getMarkdownWithPositions } from "@/utils/markdown-helper";
import { PositionMapper } from "@/utils/positionMapper";
import { importFromMarkdownWithPositions } from "@/utils/markdown";
import { codeBlockMap } from "@tau/editor/src/extensions/code-block";
import MarkdownSourceEditor from "./MarkdownSourceEditor";
import { getContentLength } from "@/utils/helper";
import useTheme from "@/hooks/useTheme";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import {
  EditOutlined,
  EyeOutlined,
  CodeOutlined,
  FormOutlined,
  BgColorsOutlined,
  FolderOutlined,
  FileMarkdownOutlined,
  CopyOutlined,
  ExportOutlined,
  ColumnWidthOutlined,
} from "@ant-design/icons";
import { TerminalSquare } from "lucide-react";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { TerminalPanel } from "@/components/Terminal";
import useTerminalStore from "@/stores/useTerminalStore";
import FileTree from "./FileTree";
import { fileAttachmentExtension } from "@/editor-extensions";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import { getFileCategory } from "./fileTypes";
import CodeFileEditor from "./CodeFileEditor";
import MediaPreview from "./MediaPreview";

import styles from "./index.module.less";
import classnames from "classnames";
import If from "@/components/If";
import {
  copyWechatHtmlToClipboard,
  downloadMarkdown,
  getEditorText,
} from "@/utils";
import { uploadResource as uploadResourceCommand } from "@/hooks/useUploadResource";
import type { IResource } from "@tau/editor/src/types/services";

const customExtensions = [fileAttachmentExtension];
type EditorViewMode = "standard" | "wide";
type ActiveFileType =
  | "markdown"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "none";

const getFileTitleFromPath = (filePath: string) => {
  const normalizedPath = (filePath || "").replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() || "";
  return fileName.replace(/\.[^.]+$/, "").trim();
};

const normalizePathSeparators = (filePath: string) =>
  (filePath || "").replace(/\\/g, "/");

const isPathWithinDir = (filePath: string, dirPath: string) => {
  const normalizedFilePath = normalizePathSeparators(filePath);
  const normalizedDirPath = normalizePathSeparators(dirPath).replace(
    /\/+$/,
    "",
  );

  if (!normalizedDirPath) {
    return false;
  }

  return (
    normalizedFilePath === normalizedDirPath ||
    normalizedFilePath.startsWith(`${normalizedDirPath}/`)
  );
};

const isMarkdownFilePath = (filePath: string) => {
  const normalizedPath = normalizePathSeparators(filePath).toLowerCase();
  return normalizedPath.endsWith(".md") || normalizedPath.endsWith(".markdown");
};

const hasExplicitScheme = (value: string) =>
  /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);

const isWindowsAbsolutePath = (value: string) => /^[a-zA-Z]:[\\/]/.test(value);

const stripLocalLinkSuffix = (value: string) =>
  value.split("#")[0].split("?")[0];

const splitFileName = (fileName: string) => {
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return { name: fileName || "未命名图片", extension: "" };
  }

  return {
    name: fileName.slice(0, extensionIndex),
    extension: fileName.slice(extensionIndex),
  };
};

const buildCopyFileName = (fileName: string, copyIndex: number) => {
  const { name, extension } = splitFileName(fileName);
  if (copyIndex === 0) return fileName;
  if (copyIndex === 1) return `${name} copy${extension}`;
  return `${name} copy${copyIndex - 1}${extension}`;
};

const withWebpExtension = (fileName: string) => {
  const { name } = splitFileName(fileName);
  return `${name}.webp`;
};

const isCompressibleImage = (file: File) => {
  const supportedTypes = ["image/png", "image/jpeg", "image/jpg"];
  return supportedTypes.includes(file.type.toLowerCase());
};

const createUploadResult = (url: string, file?: File): IResource => ({
  id: url,
  url,
  type: "image",
  name: file?.name,
  path: url,
});

const getAvailableFileName = async (dirPath: string, fileName: string) => {
  const sep = await getSep();

  for (let copyIndex = 0; copyIndex < 1000; copyIndex += 1) {
    const candidateFileName = buildCopyFileName(fileName, copyIndex);
    const candidatePath = `${dirPath}${sep}${candidateFileName}`;

    if (!(await pathExists(candidatePath))) {
      return { fileName: candidateFileName, filePath: candidatePath };
    }
  }

  throw new Error("无法生成可用的图片文件名");
};

const fileUrlToPath = (value: string) => {
  const parsedUrl = new URL(value);
  let pathname = decodeURIComponent(parsedUrl.pathname || "");

  if (/^\/[A-Za-z]:/.test(pathname)) {
    pathname = pathname.slice(1);
  }

  if (parsedUrl.hostname && parsedUrl.hostname !== "localhost") {
    return `//${parsedUrl.hostname}${pathname}`;
  }

  return pathname;
};

const SingleMarkdownEditor = () => {
  const editorServices = useEditorServices();
  const [searchParams, setSearchParams] = useSearchParams();
  const encodedFilePath = searchParams.get("filePath") || "";
  const encodedRootPath = searchParams.get("rootPath") || "";

  // filePath 和 rootPath 互斥，filePath 优先
  const initialFilePath = encodedFilePath
    ? decodeURIComponent(encodedFilePath)
    : "";
  const initialRootPath = initialFilePath
    ? "" // 如果有 filePath，rootPath 从 filePath 推导
    : encodedRootPath
      ? decodeURIComponent(encodedRootPath)
      : "";

  const [currentFilePath, setCurrentFilePath] = useState(initialFilePath);
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [loading, setLoading] = useState(!!initialFilePath); // 只有当有文件路径时才显示加载状态
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState<Descendant[]>([]);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [isReadonly, setIsReadonly] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [fileTreeOpen, setFileTreeOpen] = useState(true);
  const [activeFileType, setActiveFileType] = useState<ActiveFileType>(
    initialFilePath ? "markdown" : "none",
  );
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const [exportContent, setExportContent] = useState<Descendant[]>([]);
  const [exportTitle, setExportTitle] = useState("未命名文档");
  const [fileTreeWidth, setFileTreeWidth] = useLocalStorageState<number>(
    "markdown-editor-file-tree-width",
    {
      defaultValue: 240,
    },
  );
  const [editorViewMode, setEditorViewMode] =
    useLocalStorageState<EditorViewMode>("single-markdown-editor-view-mode", {
      defaultValue: "standard",
    });
  const { isDark } = useTheme();
  const { onDarkModeChange } = useSettingStore((state) => ({
    onDarkModeChange: state.onDarkModeChange,
  }));
  const {
    panelOpen: terminalOpen,
    panelPosition: terminalPosition,
    togglePanel: toggleTerminal,
  } = useTerminalStore();

  const editorRef = useRef<EditorRef>(null);
  const sourceEditorRef = useRef<CodeMirrorEditor | null>(null);
  const beforeSaveSourceText = useRef("");
  const currentSourceText = useRef("");
  const currentFilePathRef = useRef(initialFilePath);
  const activeWatchedFilePathRef = useRef("");
  const lastWrittenFilePathRef = useRef("");
  const lastWrittenSourceTextRef = useRef("");
  const isWritingLocalFileRef = useRef(false);
  const writingFilePathRef = useRef("");
  const externalSyncPromptOpenRef = useRef(false);
  const externalSyncModalDestroyRef = useRef<(() => void) | null>(null);
  const pendingExternalSyncRef = useRef<{
    filePath: string;
    markdownText: string;
  } | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const positionMapRef = useRef<PositionMapper | null>(null);
  const pendingSlateSelectionRef = useRef<{
    path: number[];
    offset: number;
  } | null>(null);
  const pendingSlateFocusRef = useRef(false);
  const focusDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRequestSeqRef = useRef(0);
  const pendingCodeBlockFocusRef = useRef<{
    path: number[];
    cursor: { line: number; ch: number };
    uuid?: string;
  } | null>(null);
  const lastEditorFocusRef = useRef<{
    path: number[];
    offset: number;
  } | null>(null);
  const CODE_BLOCK_FOCUS_RETRY_INTERVAL = 80;
  const CODE_BLOCK_FOCUS_MAX_WAIT = 2000;
  const resolvedEditorViewMode = editorViewMode || "standard";

  const getNodeByPath = (
    nodes: Descendant[],
    path: number[],
  ): Descendant | null => {
    let current: any = { children: nodes };
    for (const index of path) {
      if (!Array.isArray(current?.children)) {
        return null;
      }
      current = current.children[index];
      if (!current) {
        return null;
      }
    }
    return current as Descendant;
  };

  const resetEditorValue = useMemoizedFn((nodes: Descendant[]) => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    editor.isResetValue = true;
    SlateEditor.withoutNormalizing(editor, () => {
      for (let i = editor.children.length - 1; i >= 0; i -= 1) {
        Transforms.removeNodes(editor, { at: [i] });
      }
      if (nodes.length > 0) {
        Transforms.insertNodes(editor, nodes, { at: [0] });
      }
    });
    editor.isResetValue = false;
  });

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  });

  // 自定义切换主题函数
  const toggleTheme = useMemoizedFn(() => {
    onDarkModeChange(!isDark);
  });

  const toggleMode = useMemoizedFn(async () => {
    if (isSourceMode) {
      // 从源码模式切换到编辑模式
      try {
        const cursorPos = sourceEditorRef.current?.getCursor();
        const { content, positionMap } = importFromMarkdownWithPositions(
          currentSourceText.current,
        );
        setContent(content);
        resetEditorValue(content);
        positionMapRef.current = positionMap;

        const slatePos = cursorPos
          ? positionMap.markdownToSlate(cursorPos)
          : null;

        const codeBlockHint = cursorPos
          ? positionMap.getElementPropertyByMarkdown(cursorPos)
          : null;
        if (codeBlockHint?.mapping.elementType === "code-block") {
          const codeBlockPath = [...codeBlockHint.mapping.slateElementPath];
          const codeBlockNode = getNodeByPath(content, codeBlockPath) as any;
          let codeCursor =
            codeBlockHint.propertyName === "code" && codeBlockHint.relativePos
              ? codeBlockHint.relativePos
              : null;

          const codeRange = codeBlockHint.mapping.propertyMappings?.code;
          if (!codeCursor && cursorPos && codeRange) {
            const targetLine = Math.min(
              Math.max(cursorPos.line, codeRange.mdStartLine),
              codeRange.mdEndLine,
            );
            const lineBaseCh =
              targetLine === codeRange.mdStartLine ? codeRange.mdStartCh : 0;
            const lineEndCh =
              targetLine === codeRange.mdEndLine
                ? codeRange.mdEndCh
                : cursorPos.ch;
            const targetCh = Math.min(
              Math.max(cursorPos.ch, lineBaseCh),
              Math.max(lineBaseCh, lineEndCh),
            );
            codeCursor = {
              line: Math.max(0, targetLine - codeRange.mdStartLine),
              ch: Math.max(0, targetCh - lineBaseCh),
            };
          }

          pendingCodeBlockFocusRef.current = {
            path: codeBlockPath,
            cursor: codeCursor ?? { line: 0, ch: 0 },
            uuid:
              typeof codeBlockNode?.uuid === "string"
                ? codeBlockNode.uuid
                : undefined,
          };
          pendingSlateSelectionRef.current = {
            path: codeBlockPath,
            offset: 0,
          };
        } else {
          pendingCodeBlockFocusRef.current = null;
          pendingSlateSelectionRef.current =
            slatePos ?? lastEditorFocusRef.current;
        }

        pendingSlateFocusRef.current = true;
        focusRequestSeqRef.current += 1;
        const nextFocusRequestId = focusRequestSeqRef.current;
        setFocusRequestId(nextFocusRequestId);
        setIsSourceMode(false);
      } catch (error) {
        console.error("解析Markdown失败:", error);
      }
    } else {
      // 从编辑模式切换到源码模式
      const editor = editorRef.current?.getEditor();
      const selection = editor?.selection;
      lastEditorFocusRef.current = selection?.focus
        ? {
            path: [...selection.focus.path],
            offset: selection.focus.offset,
          }
        : null;

      // 使用带位置映射的序列化
      const { markdown, positionMap } = getMarkdownWithPositions(content);

      currentSourceText.current = markdown;
      positionMapRef.current = positionMap;

      if (!sourceEditorRef.current) {
        console.error("源码编辑器未初始化");
        return;
      }

      sourceEditorRef.current.setValue(markdown);

      // 应用光标位置映射（Slate → Markdown）
      if (selection && selection.focus && editor) {
        let mdPos = null;
        const codeBlockEntry = SlateEditor.above(editor, {
          at: selection.focus,
          match: (node) =>
            SlateElement.isElement(node) && node.type === "code-block",
        });
        if (codeBlockEntry) {
          const [codeBlockNode, codeBlockPath] = codeBlockEntry as any;
          const uuid = codeBlockNode?.uuid;
          const codeEditor = uuid ? codeBlockMap.get(uuid) : null;
          const mapping =
            positionMap.getElementMappingBySlatePath(codeBlockPath);
          const codeMapping = mapping?.propertyMappings?.code;
          if (codeEditor && codeMapping) {
            const cursor = codeEditor.getCursor();
            const line = codeMapping.mdStartLine + cursor.line;
            const chBase = codeMapping.mdStartCh;
            mdPos = { line, ch: chBase + cursor.ch };
          }
        }
        if (!mdPos) {
          mdPos = positionMap.slateToMarkdown(selection.focus);
        }

        if (mdPos) {
          setTimeout(() => {
            sourceEditorRef.current?.setCursor(mdPos);
            sourceEditorRef.current?.focus();
          }, 100);
        }
      }

      setTimeout(() => {
        if (!sourceEditorRef.current) return;
        sourceEditorRef.current.refresh();
      }, 150);
      setIsSourceMode(true);
    }
  });

  const resolveSlatePoint = (
    editor: ReturnType<EditorRef["getEditor"]>,
    point: { path: number[]; offset: number } | null,
  ) => {
    if (!point) {
      return null;
    }

    if (SlateEditor.hasPath(editor, point.path)) {
      try {
        const [node] = SlateEditor.node(editor, point.path);
        if (Text.isText(node)) {
          return {
            path: point.path,
            offset: Math.min(point.offset, node.text.length),
          };
        }
        if (SlateElement.isElement(node)) {
          return SlateEditor.start(editor, point.path);
        }
      } catch {
        return null;
      }
      return SlateEditor.start(editor, point.path);
    }

    for (let i = point.path.length - 1; i >= 0; i -= 1) {
      const basePath = point.path.slice(0, i);
      if (!SlateEditor.hasPath(editor, basePath)) {
        continue;
      }
      const [node] = SlateEditor.node(editor, basePath);
      if (Text.isText(node)) {
        return {
          path: basePath,
          offset: Math.min(point.offset, node.text.length),
        };
      }
      const children = (node as any).children;
      if (Array.isArray(children) && children.length > 0) {
        const desiredIndex =
          typeof point.path[i] === "number"
            ? point.path[i]
            : children.length - 1;
        const clampedIndex = Math.min(
          Math.max(desiredIndex, 0),
          children.length - 1,
        );
        const candidatePath = [...basePath, clampedIndex];
        if (SlateEditor.hasPath(editor, candidatePath)) {
          const [child] = SlateEditor.node(editor, candidatePath);
          if (Text.isText(child)) {
            return {
              path: candidatePath,
              offset: Math.min(point.offset, child.text.length),
            };
          }
          return SlateEditor.end(editor, candidatePath);
        }
        return SlateEditor.end(editor, basePath);
      }
      return SlateEditor.end(editor, basePath);
    }

    return null;
  };

  const clearPendingFocusState = useMemoizedFn(() => {
    pendingCodeBlockFocusRef.current = null;
    pendingSlateSelectionRef.current = null;
    pendingSlateFocusRef.current = false;
  });

  const applySlateFallbackFocus = useMemoizedFn(
    (editor: ReturnType<EditorRef["getEditor"]>) => {
      const target = resolveSlatePoint(
        editor,
        pendingSlateSelectionRef.current,
      );
      if (!target) {
        clearPendingFocusState();
        return;
      }
      Transforms.select(editor, { anchor: target, focus: target });
      ReactEditor.focus(editor);
      clearPendingFocusState();
    },
  );

  useEffect(() => {
    if (!isSourceMode && pendingSlateFocusRef.current && focusRequestId > 0) {
      const scheduledRequestId = focusRequestId;
      if (focusDelayTimerRef.current) {
        clearTimeout(focusDelayTimerRef.current);
        focusDelayTimerRef.current = null;
      }
      focusDelayTimerRef.current = setTimeout(() => {
        focusDelayTimerRef.current = null;
        if (scheduledRequestId !== focusRequestSeqRef.current) {
          return;
        }
        if (!pendingSlateFocusRef.current) {
          return;
        }
        if (!editorRef.current) {
          clearPendingFocusState();
          return;
        }
        const editor = editorRef.current.getEditor();
        if (!editor) {
          clearPendingFocusState();
          return;
        }

        try {
          const codeBlockFocus = pendingCodeBlockFocusRef.current;
          if (codeBlockFocus) {
            const focusStartTime = Date.now();
            const attemptFocus = (count: number) => {
              if (!pendingSlateFocusRef.current) {
                return;
              }
              const currentFocus = pendingCodeBlockFocusRef.current;
              if (!currentFocus) {
                applySlateFallbackFocus(editor);
                return;
              }
              if (!SlateEditor.hasPath(editor, currentFocus.path)) {
                applySlateFallbackFocus(editor);
                return;
              }

              let uuid = currentFocus.uuid;
              let codeEditor = uuid ? codeBlockMap.get(uuid) : null;
              if (!codeEditor) {
                const [node] = SlateEditor.node(editor, currentFocus.path);
                const pathUuid = (node as any)?.uuid;
                if (typeof pathUuid === "string") {
                  uuid = pathUuid;
                  pendingCodeBlockFocusRef.current = {
                    ...currentFocus,
                    uuid: pathUuid,
                  };
                  codeEditor = codeBlockMap.get(pathUuid);
                }
              }

              if (!codeEditor) {
                if (Date.now() - focusStartTime >= CODE_BLOCK_FOCUS_MAX_WAIT) {
                  applySlateFallbackFocus(editor);
                } else {
                  setTimeout(
                    () => attemptFocus(count + 1),
                    CODE_BLOCK_FOCUS_RETRY_INTERVAL,
                  );
                }
                return;
              }
              const line = Math.min(
                currentFocus.cursor.line,
                codeEditor.lastLine(),
              );
              const lineText = codeEditor.getLine(line) || "";
              const ch = Math.min(currentFocus.cursor.ch, lineText.length);
              codeEditor.focus();
              codeEditor.setCursor({ line, ch });
              clearPendingFocusState();
            };
            attemptFocus(0);
            return;
          }

          applySlateFallbackFocus(editor);
        } catch (e) {
          console.error("设置光标失败，不进行聚焦:", e);
          clearPendingFocusState();
        }
      }, 100);

      return () => {
        if (focusDelayTimerRef.current) {
          clearTimeout(focusDelayTimerRef.current);
          focusDelayTimerRef.current = null;
        }
      };
    }
  }, [focusRequestId, isSourceMode]);

  // 使用节流函数计算字数，每秒最多计算一次
  const { run: calculateWordCount } = useThrottleFn(
    () => {
      if (isSourceMode) {
        const editorContent = importFromMarkdown(currentSourceText.current);
        setWordCount(getContentLength(editorContent));
      } else {
        setWordCount(getContentLength(content));
      }
    },
    { wait: 1000 },
  );

  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
  }, [currentFilePath]);

  const getCurrentMarkdownText = useMemoizedFn(() => {
    return isSourceMode ? currentSourceText.current : getMarkdown(content);
  });

  const getCurrentSlateContent = useMemoizedFn(() => {
    return isSourceMode
      ? importFromMarkdown(currentSourceText.current)
      : content;
  });

  const getCurrentDocumentTitle = useMemoizedFn((nodes?: Descendant[]) => {
    const fileTitle = getFileTitleFromPath(currentFilePathRef.current);
    if (fileTitle) {
      return fileTitle;
    }

    const textTitle = getEditorText(nodes || content, 20).trim();
    return textTitle || "未命名文档";
  });

  const prepareExportPayload = useMemoizedFn(() => {
    try {
      const nextContent = getCurrentSlateContent();
      const nextTitle = getCurrentDocumentTitle(nextContent);
      setExportContent(nextContent);
      setExportTitle(nextTitle);
      return {
        content: nextContent,
        title: nextTitle,
      };
    } catch (error) {
      console.error("准备导出内容失败:", error);
      message.error("当前 Markdown 解析失败，请修正后再试");
      return null;
    }
  });

  const handleCopyMarkdown = useMemoizedFn(async () => {
    try {
      await navigator.clipboard.writeText(getCurrentMarkdownText());
      message.success("已复制 Markdown 到剪贴板");
    } catch (error) {
      console.error("复制 Markdown 失败:", error);
      message.error("复制失败，请稍后重试");
    }
  });

  const handleCopyWechat = useMemoizedFn(async () => {
    try {
      const currentContent = getCurrentSlateContent();
      await copyWechatHtmlToClipboard(currentContent, message);
    } catch (error) {
      console.error("复制微信公众号格式失败:", error);
      message.error("复制失败，请稍后重试");
    }
  });

  const handleDownloadCurrentMarkdown = useMemoizedFn(() => {
    try {
      const markdownText = getCurrentMarkdownText();
      downloadMarkdown(markdownText, getCurrentDocumentTitle());
      message.success("Markdown 已导出");
    } catch (error) {
      console.error("导出 Markdown 失败:", error);
      message.error("导出失败，请稍后重试");
    }
  });

  const handleOpenPdfExportModal = useMemoizedFn(() => {
    const payload = prepareExportPayload();
    if (!payload) {
      return;
    }
    setPdfExportModalOpen(true);
  });

  const handleOpenEpubExportModal = useMemoizedFn(() => {
    const payload = prepareExportPayload();
    if (!payload) {
      return;
    }
    setEpubExportModalOpen(true);
  });

  const toggleEditorViewMode = useMemoizedFn(() => {
    setEditorViewMode(resolvedEditorViewMode === "wide" ? "standard" : "wide");
  });

  const handleCopyMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (key === "copy-markdown") {
        await handleCopyMarkdown();
      } else if (key === "copy-wechat") {
        await handleCopyWechat();
      }
    },
  );

  const handleExportMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (key === "export-markdown") {
        handleDownloadCurrentMarkdown();
      } else if (key === "export-pdf") {
        handleOpenPdfExportModal();
      } else if (key === "export-epub") {
        handleOpenEpubExportModal();
      }
    },
  );

  const applyMarkdownText = useMemoizedFn(
    (
      filePathToApply: string,
      markdownText: string,
      options?: { notifyExternalSync?: boolean },
    ) => {
      if (!filePathToApply || filePathToApply !== currentFilePathRef.current) {
        return;
      }

      const editorContent = importFromMarkdown(markdownText);
      setContent(editorContent);
      setError(null);
      currentSourceText.current = markdownText;
      beforeSaveSourceText.current = markdownText;
      pendingExternalSyncRef.current = null;

      if (editorRef.current) {
        editorRef.current.setEditorValue(editorContent);
      }

      if (sourceEditorRef.current) {
        sourceEditorRef.current.setValue(markdownText);
      }

      calculateWordCount();

      if (options?.notifyExternalSync) {
        message.info({
          content: "检测到外部更新，已同步最新内容",
          key: "single-markdown-editor-external-sync",
          duration: 1.5,
        });
      }
    },
  );

  const promptExternalSyncConflict = useMemoizedFn(
    (filePathToApply: string, markdownText: string) => {
      pendingExternalSyncRef.current = {
        filePath: filePathToApply,
        markdownText,
      };

      if (externalSyncPromptOpenRef.current) {
        return;
      }

      externalSyncPromptOpenRef.current = true;
      const modal = Modal.confirm({
        title: "检测到文件已被外部修改",
        content: "当前编辑器也有未保存改动，是否重新加载磁盘中的最新内容？",
        okText: "重新加载",
        cancelText: "保留当前内容",
        onOk: () => {
          const pendingExternalSync = pendingExternalSyncRef.current;
          pendingExternalSyncRef.current = null;
          externalSyncPromptOpenRef.current = false;
          externalSyncModalDestroyRef.current = null;
          if (!pendingExternalSync) {
            return;
          }

          applyMarkdownText(
            pendingExternalSync.filePath,
            pendingExternalSync.markdownText,
            { notifyExternalSync: true },
          );
        },
        onCancel: () => {
          pendingExternalSyncRef.current = null;
          externalSyncPromptOpenRef.current = false;
          externalSyncModalDestroyRef.current = null;
        },
      });
      externalSyncModalDestroyRef.current = () => {
        modal.destroy();
      };
    },
  );

  const stopWatchingFile = useMemoizedFn(async (filePathToStop?: string) => {
    const targetFilePath = filePathToStop || activeWatchedFilePathRef.current;
    if (!targetFilePath) {
      return;
    }

    if (activeWatchedFilePathRef.current === targetFilePath) {
      activeWatchedFilePathRef.current = "";
    }

    try {
      await unwatchTextFile(targetFilePath);
    } catch (watchError) {
      console.error("取消Markdown文件监听失败:", watchError);
    }
  });

  const startWatchingFile = useMemoizedFn(async (filePathToWatch: string) => {
    if (!filePathToWatch) {
      return;
    }

    if (activeWatchedFilePathRef.current === filePathToWatch) {
      return;
    }

    if (activeWatchedFilePathRef.current) {
      await stopWatchingFile(activeWatchedFilePathRef.current);
    }

    try {
      await watchTextFile(filePathToWatch);
      activeWatchedFilePathRef.current = filePathToWatch;
    } catch (watchError) {
      console.error("监听Markdown文件失败:", watchError);
      activeWatchedFilePathRef.current = "";
    }
  });

  const saveMarkdownFile = useMemoizedFn(async (filePathToSave?: string) => {
    const pathToSave = filePathToSave || currentFilePathRef.current;
    if (!pathToSave || isWritingLocalFileRef.current) return;

    try {
      const markdownText = isSourceMode
        ? currentSourceText.current
        : getMarkdown(content);
      if (markdownText === beforeSaveSourceText.current) return;

      isWritingLocalFileRef.current = true;
      writingFilePathRef.current = pathToSave;
      lastWrittenFilePathRef.current = pathToSave;
      lastWrittenSourceTextRef.current = markdownText;
      await writeTextFile(pathToSave, markdownText);
      beforeSaveSourceText.current = markdownText;
      currentSourceText.current = markdownText;
    } catch (error) {
      console.error("保存Markdown文件失败:", error);
      message.error("保存失败");
    } finally {
      isWritingLocalFileRef.current = false;
      writingFilePathRef.current = "";
    }
  });

  const onSourceEditorDidMount = useMemoizedFn((editor: CodeMirrorEditor) => {
    sourceEditorRef.current = editor;
  });

  const syncSearchParamsWithFilePath = useMemoizedFn((nextFilePath: string) => {
    const params = new URLSearchParams(searchParams);
    if (nextFilePath) {
      params.set("filePath", encodeURIComponent(nextFilePath));
    } else {
      params.delete("filePath");
    }
    setSearchParams(params, { replace: true });
  });

  const shouldSyncRootPath = useMemoizedFn((nextFilePath: string) => {
    if (!rootPath) {
      return true;
    }
    return !isPathWithinDir(nextFilePath, rootPath);
  });

  const loadMarkdownFile = useMemoizedFn(async (filePathToLoad: string) => {
    try {
      const markdownText = await readTextFile(filePathToLoad);
      applyMarkdownText(filePathToLoad, markdownText);
      setError(null);

      // editorRef.current?.focus();
      calculateWordCount();

      // 滚动到顶部
      setTimeout(() => {
        editorContainerRef.current?.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }, 100);
      return true;
    } catch (error) {
      console.error("加载Markdown文件失败:", error);
      message.error("加载文件失败");
      setError(error instanceof Error ? error.message : "未知错误");
      return false;
    }
  });

  const switchMarkdownFile = useMemoizedFn(
    async (
      newFilePath: string,
      options?: {
        syncRootPath?: boolean;
      },
    ) => {
      if (!newFilePath) {
        return false;
      }

      if (newFilePath === currentFilePathRef.current) {
        if (options?.syncRootPath && shouldSyncRootPath(newFilePath)) {
          const dirPath = await getDirectoryName(newFilePath);
          setRootPath(dirPath);
        }
        return true;
      }

      const shouldUpdateRootPath =
        !!options?.syncRootPath && shouldSyncRootPath(newFilePath);

      await saveMarkdownFile(currentFilePathRef.current);
      await stopWatchingFile(currentFilePathRef.current);
      pendingExternalSyncRef.current = null;
      externalSyncPromptOpenRef.current = false;
      externalSyncModalDestroyRef.current?.();
      externalSyncModalDestroyRef.current = null;

      currentFilePathRef.current = newFilePath;
      setCurrentFilePath(newFilePath);
      syncSearchParamsWithFilePath(newFilePath);
      const loaded = await loadMarkdownFile(newFilePath);
      if (!loaded) {
        return false;
      }

      await startWatchingFile(newFilePath);
      if (shouldUpdateRootPath) {
        const dirPath = await getDirectoryName(newFilePath);
        setRootPath(dirPath);
      }
      return true;
    },
  );

  const openLocalPathWithDefaultApp = useMemoizedFn(
    async (targetPath: string) => {
      const openResult = await openFileWithDefaultApp(targetPath);
      if (openResult) {
        throw new Error(openResult);
      }
    },
  );

  const resolveLocalLinkTarget = useMemoizedFn(async (rawUrl: string) => {
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) {
      throw new Error("链接为空");
    }

    if (trimmedUrl.startsWith("#")) {
      throw new Error("暂不支持锚点跳转");
    }

    if (/^file:\/\//i.test(trimmedUrl)) {
      return fileUrlToPath(trimmedUrl);
    }

    if (
      isWindowsAbsolutePath(trimmedUrl) ||
      trimmedUrl.startsWith("/") ||
      trimmedUrl.startsWith("\\\\")
    ) {
      return decodeURIComponent(stripLocalLinkSuffix(trimmedUrl));
    }

    const currentFilePath = currentFilePathRef.current;
    if (!currentFilePath) {
      throw new Error("当前没有可作为基准的 Markdown 文件");
    }

    const baseDir = await getDirectoryName(currentFilePath);
    const relativeTarget = decodeURIComponent(stripLocalLinkSuffix(trimmedUrl));
    if (!relativeTarget) {
      throw new Error("暂不支持锚点跳转");
    }

    return await resolvePathFrom(baseDir, relativeTarget);
  });

  const handleEditorOpenUrl = useMemoizedFn(async (rawUrl: string) => {
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) {
      return;
    }

    if (
      !/^file:\/\//i.test(trimmedUrl) &&
      hasExplicitScheme(trimmedUrl) &&
      !isWindowsAbsolutePath(trimmedUrl)
    ) {
      await openExternal(trimmedUrl);
      return;
    }

    try {
      const targetPath = await resolveLocalLinkTarget(trimmedUrl);
      const targetExists = await pathExists(targetPath);
      if (!targetExists) {
        message.error("链接目标不存在");
        return;
      }

      if (await isDirectory(targetPath)) {
        await openLocalPathWithDefaultApp(targetPath);
        return;
      }

      if (isMarkdownFilePath(targetPath)) {
        await switchMarkdownFile(targetPath, { syncRootPath: true });
        return;
      }

      await openLocalPathWithDefaultApp(targetPath);
    } catch (error) {
      console.error("打开链接失败:", error);
      message.error(
        error instanceof Error ? error.message : "打开链接失败，请稍后重试",
      );
    }
  });

  const onFileClick = useMemoizedFn(async (newFilePath: string) => {
    const category = getFileCategory(newFilePath);

    if (category === "external") {
      await openFileWithDefaultApp(newFilePath);
      return;
    }

    if (category === "markdown") {
      if (
        newFilePath === currentFilePathRef.current &&
        activeFileType === "markdown"
      )
        return;
      setActiveFileType("markdown");
      await switchMarkdownFile(newFilePath);
      return;
    }

    setActiveFileType(category as ActiveFileType);
    setCurrentFilePath(newFilePath);
    currentFilePathRef.current = newFilePath;
  });

  const uploadLocalImageToCurrentDocumentDir = useMemoizedFn(
    async (file: File): Promise<IResource> => {
      const { imageBed } = useSettingStore.getState().setting;
      const currentMarkdownPath = currentFilePathRef.current;

      if (imageBed.active !== EImageBed.Local || !currentMarkdownPath) {
        const url = await uploadResourceCommand(file);
        if (!url) {
          throw new Error("图片上传失败");
        }
        return createUploadResult(url, file);
      }

      try {
        let processedFile = file;
        let fileName = file.name;

        if (imageBed.enableCompression && isCompressibleImage(file)) {
          const compressedBuffer = await compressImage(
            new Uint8Array(await file.arrayBuffer()),
            file.type,
          );

          fileName = withWebpExtension(file.name);
          processedFile = new File([compressedBuffer], fileName, {
            type: "image/webp",
          });
        }

        const documentDirPath = await getDirectoryName(currentMarkdownPath);
        const target = await getAvailableFileName(documentDirPath, fileName);

        await writeBinaryFile(
          target.filePath,
          new Uint8Array(await processedFile.arrayBuffer()),
        );

        return createUploadResult(target.fileName, processedFile);
      } catch (error) {
        console.error("保存图片到当前文档目录失败，回退到默认上传逻辑:", error);
        const url = await uploadResourceCommand(file);
        if (!url) {
          throw new Error("图片上传失败");
        }
        return createUploadResult(url, file);
      }
    },
  );

  const singleMarkdownEditorServices = useMemo(
    () => ({
      ...editorServices,
      resource: {
        ...editorServices.resource,
        upload: uploadLocalImageToCurrentDocumentDir,
      },
      utility: {
        ...editorServices.utility,
        openUrl: handleEditorOpenUrl,
      },
    }),
    [editorServices, handleEditorOpenUrl, uploadLocalImageToCurrentDocumentDir],
  );

  useEffect(() => {
    // 监听键盘快捷键
    const handleKeyDown = (event: KeyboardEvent) => {
      // 保存: Ctrl+S 或 Command+S
      if (isHotkey("mod+s", event)) {
        event.preventDefault();
        saveMarkdownFile();
      }

      // 切换模式: Ctrl+/ 或 Command+/
      if (isHotkey("mod+/", event)) {
        event.preventDefault();
        toggleMode();
      }

      // 切换终端: Ctrl+` 或 Command+`
      if (isHotkey("mod+`", event)) {
        event.preventDefault();
        toggleTerminal();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveMarkdownFile, toggleMode, toggleTerminal]);

  useEffect(() => {
    const init = async () => {
      if (initialFilePath) {
        // 有文件路径，加载文件并设置 rootPath
        const loaded = await loadMarkdownFile(initialFilePath);
        const dirPath = await getDirectoryName(initialFilePath);
        setRootPath(dirPath);
        if (loaded) {
          await startWatchingFile(initialFilePath);
        }
      } else if (initialRootPath) {
        // 只有 rootPath，不加载文件
        setRootPath(initialRootPath);
      }
    };

    init().finally(() => {
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleTextFileChanged = async (
      _event: unknown,
      payload: TextFileChangedPayload,
    ) => {
      const changedFilePath = payload?.filePath;
      if (!changedFilePath) {
        return;
      }

      if (changedFilePath !== activeWatchedFilePathRef.current) {
        return;
      }

      if (changedFilePath !== currentFilePathRef.current) {
        return;
      }

      if (
        isWritingLocalFileRef.current &&
        changedFilePath === writingFilePathRef.current
      ) {
        return;
      }

      try {
        const markdownText = await readTextFile(changedFilePath);

        if (changedFilePath !== activeWatchedFilePathRef.current) {
          return;
        }

        if (changedFilePath !== currentFilePathRef.current) {
          return;
        }

        if (
          changedFilePath === lastWrittenFilePathRef.current &&
          markdownText === lastWrittenSourceTextRef.current
        ) {
          return;
        }

        const currentMarkdownText = getCurrentMarkdownText();
        if (markdownText === currentMarkdownText) {
          return;
        }

        const hasLocalUnsavedChanges =
          currentMarkdownText !== beforeSaveSourceText.current;

        if (hasLocalUnsavedChanges) {
          promptExternalSyncConflict(changedFilePath, markdownText);
          return;
        }

        applyMarkdownText(changedFilePath, markdownText, {
          notifyExternalSync: true,
        });
      } catch (syncError) {
        console.error("同步外部Markdown文件变更失败:", syncError);
      }
    };

    onTextFileChanged(handleTextFileChanged);
    return () => {
      offTextFileChanged(handleTextFileChanged);
    };
  }, [applyMarkdownText, getCurrentMarkdownText, promptExternalSyncConflict]);

  useEffect(() => {
    calculateWordCount();
  }, [content, calculateWordCount]);

  // 每隔3秒自动保存
  useRafInterval(() => {
    if (error) return;
    saveMarkdownFile();
  }, 500);

  // 窗口关闭时保存
  useUnmount(() => {
    saveMarkdownFile();
    void stopWatchingFile();
    pendingExternalSyncRef.current = null;
    externalSyncPromptOpenRef.current = false;
    externalSyncModalDestroyRef.current?.();
    externalSyncModalDestroyRef.current = null;
  });

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    setContent(value);
  });

  const onSourceTextChange = useMemoizedFn(
    (_editor: CodeMirrorEditor, _change: EditorChange, code: string) => {
      currentSourceText.current = code;
      calculateWordCount();
    },
  );

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!rootPath && !currentFilePath) {
    return <div className={styles.loading}>未指定文件路径或文件夹</div>;
  }

  return (
    <div
      className={classnames(styles.singleMarkdownEditorContainer, {
        [styles.dark]: isDark,
      })}
    >
      <div
        className={classnames(styles.editorAndTerminal, {
          [styles.terminalRight]: terminalOpen && terminalPosition === "right",
        })}
      >
        <div className={styles.mainContent}>
          <ResizableAndHideableSidebar
            width={fileTreeWidth ?? 240}
            open={fileTreeOpen}
            onWidthChange={(width) => setFileTreeWidth(width)}
            className={styles.fileTreeSidebar}
            minWidth={200}
            maxWidth={400}
            side="right"
          >
            <div className={styles.fileTreeContainer}>
              {rootPath && (
                <FileTree
                  currentFilePath={currentFilePath}
                  onFileClick={onFileClick}
                  rootPath={rootPath}
                />
              )}
            </div>
          </ResizableAndHideableSidebar>

          <div className={styles.editorContainer} ref={editorContainerRef}>
            {activeFileType === "markdown" && currentFilePath ? (
              <>
                <div
                  className={classnames(styles.sourceEditor, {
                    [styles.hidden]: !isSourceMode,
                    [styles.sourceEditorWide]:
                      resolvedEditorViewMode === "wide",
                  })}
                >
                  <MarkdownSourceEditor
                    value={currentSourceText.current}
                    onChange={onSourceTextChange}
                    editorDidMount={onSourceEditorDidMount}
                    isDark={isDark}
                    readonly={isReadonly}
                  />
                </div>
                <If condition={!isSourceMode}>
                  <div className={styles.contentEditor}>
                    <ErrorBoundary>
                      <EditorServicesProvider
                        services={singleMarkdownEditorServices}
                      >
                        <Editor
                          key={currentFilePath}
                          className={classnames(styles.editor, {
                            [styles.editorWide]:
                              resolvedEditorViewMode === "wide",
                          })}
                          ref={editorRef}
                          initValue={content}
                          onChange={onContentChange}
                          readonly={isReadonly}
                          theme={isDark ? "dark" : "light"}
                          extensions={customExtensions}
                        />
                      </EditorServicesProvider>
                    </ErrorBoundary>
                    <div className={styles.outlineContainer}>
                      <EditorOutline
                        className={styles.outline}
                        content={content}
                        show={true}
                        onClickHeader={onClickHeader}
                      />
                    </div>
                  </div>
                </If>
              </>
            ) : activeFileType === "code" && currentFilePath ? (
              <div className={styles.sourceEditor}>
                <CodeFileEditor
                  key={currentFilePath}
                  filePath={currentFilePath}
                  isDark={isDark}
                />
              </div>
            ) : (activeFileType === "image" ||
                activeFileType === "video" ||
                activeFileType === "audio") &&
              currentFilePath ? (
              <MediaPreview
                key={currentFilePath}
                filePath={currentFilePath}
                type={activeFileType}
              />
            ) : (
              <div className={styles.emptyEditor}>
                <div className={styles.emptyContent}>
                  <FileMarkdownOutlined
                    style={{ fontSize: 64, color: "#999" }}
                  />
                  <p>请从左侧文件树选择一个文件</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {rootPath && <TerminalPanel cwd={rootPath} />}
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusBarLeft}>
          <Tooltip title={fileTreeOpen ? "隐藏文件树" : "显示文件树"}>
            <Button
              type="text"
              icon={<FolderOutlined />}
              onClick={() => setFileTreeOpen(!fileTreeOpen)}
            />
          </Tooltip>

          {activeFileType === "markdown" && (
            <>
              <Tooltip title={isReadonly ? "切换到编辑模式" : "切换到只读模式"}>
                <Button
                  type="text"
                  icon={isReadonly ? <EditOutlined /> : <EyeOutlined />}
                  onClick={() => setIsReadonly(!isReadonly)}
                />
              </Tooltip>

              <Tooltip
                title={isSourceMode ? "切换到编辑模式" : "切换到源码模式"}
              >
                <Button
                  type="text"
                  icon={isSourceMode ? <FormOutlined /> : <CodeOutlined />}
                  onClick={toggleMode}
                />
              </Tooltip>

              <Tooltip
                title={
                  resolvedEditorViewMode === "wide"
                    ? "当前为宽屏视图，点击切换到标准视图"
                    : "当前为标准视图，点击切换到宽屏视图"
                }
              >
                <Button
                  type="text"
                  icon={<ColumnWidthOutlined />}
                  onClick={toggleEditorViewMode}
                />
              </Tooltip>
            </>
          )}

          <Tooltip title={isDark ? "切换到浅色模式" : "切换到深色模式"}>
            <Button
              type="text"
              icon={<BgColorsOutlined />}
              onClick={toggleTheme}
            />
          </Tooltip>

          <Tooltip title={terminalOpen ? "关闭终端" : "打开终端"}>
            <Button
              type="text"
              icon={<TerminalSquare size={14} />}
              onClick={toggleTerminal}
            />
          </Tooltip>
        </div>

        <div className={styles.statusBarRight}>
          {activeFileType === "markdown" && (
            <>
              <div className={styles.statusBarActions}>
                <Dropdown
                  disabled={!currentFilePath}
                  trigger={["click"]}
                  menu={{
                    items: [
                      { key: "copy-markdown", label: "Markdown" },
                      { key: "copy-wechat", label: "微信公众号" },
                    ],
                    onClick: handleCopyMenuClick,
                  }}
                >
                  <Tooltip title="复制">
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      disabled={!currentFilePath}
                    />
                  </Tooltip>
                </Dropdown>
                <Dropdown
                  disabled={!currentFilePath}
                  trigger={["click"]}
                  menu={{
                    items: [
                      { key: "export-markdown", label: "Markdown" },
                      { key: "export-pdf", label: "PDF" },
                      { key: "export-epub", label: "EPUB" },
                    ],
                    onClick: handleExportMenuClick,
                  }}
                >
                  <Tooltip title="导出">
                    <Button
                      type="text"
                      icon={<ExportOutlined />}
                      disabled={!currentFilePath}
                    />
                  </Tooltip>
                </Dropdown>
              </div>
              <span className={styles.wordCount}>{wordCount} 字</span>
            </>
          )}
        </div>
      </div>

      <EpubExportModal
        open={epubExportModalOpen}
        onClose={() => setEpubExportModalOpen(false)}
        content={exportContent}
        title={exportTitle}
      />
      <PdfExportModal
        visible={pdfExportModalOpen}
        onClose={() => setPdfExportModalOpen(false)}
        content={exportContent}
        title={exportTitle}
      />
    </div>
  );
};

export default SingleMarkdownEditor;
