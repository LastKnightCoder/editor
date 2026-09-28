import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";
import { createDesktopKit } from "@/services/editorKit";
import type { EditorKit } from "@tau/editor/src";
import { useMemoizedFn } from "ahooks";
import {
  ArrowUp,
  AtSign,
  Brain,
  ChevronDown,
  CornerDownRight,
  FileText,
  ImagePlus,
  Plug,
  ShieldCheck,
  ShieldOff,
  Square,
  SquarePen,
  X,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Descendant } from "slate";

import { Editor, type EditorRef, type IHotKeyConfig } from "@tau/editor/src";
import {
  DEFAULT_CHAT_INPUT_PLACEHOLDER,
  resolveChatInputPlaceholder,
  type ChatInputAreaHandle,
  type ChatInputAreaServices,
  type MentionEntityType,
  type MentionRef,
  type MessageContentItem,
  type ThinkingLevel,
  type ChatContextUsage,
} from "@tau/shared";
import { IconButton, ImagePreview, Menu, Tooltip, cn, toast } from "@tau/ui";

import useUploadResource from "@/hooks/useUploadResource";
import { convertFileSrc, getHomeDir } from "@/commands";
import { copyFileToLocal } from "@/utils";
import { McpQuickPanel } from "@/features/mcp/components/McpQuickPanel";
import { contentLinkExtension, skillRefExtension } from "@/editor-extensions";
import { SkillPickerPanel } from "@/editor-extensions/skill-ref/SkillPickerPanel";
import useSettingStore from "@/stores/useSettingStore";
import {
  TOOL_PERMISSION_MODES,
  normalizePermissionMode,
  type ToolPermissionMode,
} from "@/services/tool-permission/mode";
import { wrapContentLink } from "@/editor-extensions/content-link/components/utils";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import { ContextUsageRing } from "./ContextUsageRing";
import { ComposerAddMenu, type ComposerAddItem } from "./ComposerAddMenu";

export type { ChatInputAreaHandle };

/** 聊天输入场景（ER-016）：只要引用能力，不要库内块 */
let chatInputKit: EditorKit | null = null;
const getChatInputKit = () =>
  (chatInputKit ??= createDesktopKit([contentLinkExtension, skillRefExtension]));

/** 模型菜单：按服务商分组（组头 = 服务商，项 key = `${providerId}::${modelName}`） */
export interface ChatModelGroup {
  key: string;
  label: string;
  children?: Array<{ key: string; label: string; description?: string }>;
}

interface ChatInputAreaProps {
  className?: string;
  contentEditable?: boolean;
  onPressEnter?: () => void;
  /**
   * 插话（⌘/Ctrl + Shift + Enter 或插话按钮）：内容送进正在进行的这一轮，
   * 当前步骤结束后交给模型。缺省表示当前不能插话（会话空闲或在编辑上下文里）。
   */
  onSteer?: () => void;
  onStop?: () => void;
  placeholder?: string;
  sendLoading?: boolean;
  allowSendWhileLoading?: boolean;
  queuedMessageCount?: number;
  createMessageLoading?: boolean;
  onCreateNewMessage?: () => void;
  modelGroups?: ChatModelGroup[];
  /** 当前选中模型的 key（`${providerId}::${modelName}`），用于菜单勾选 */
  currentModelKey?: string;
  onModelSelect?: ({ key }: { key: string }) => void;
  currentModelName?: string;
  contextWindowK?: number;
  contextUsage?: ChatContextUsage | null;
  isSupportImage?: boolean;
  isSupportFile?: boolean;
  thinkingLevel?: ThinkingLevel;
  /** 当前模型真实支持的档位（由模型能力决定） */
  thinkingLevelOptions?: readonly ThinkingLevel[];
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
  thinkingLevelDisabled?: boolean;
  showMcpManager?: boolean;
  /** 工具作用域：MCP 面板额外列出该作用域的页面专属工具 */
  toolScope?: string;
  /** 紧凑档（停靠栏 400px）：模型名限宽、思考强度取两字短名，工具行不折行 */
  compact?: boolean;
}

interface ChatImageItem {
  id: string;
  previewUrl: string;
  path: string;
}

interface ChatFileItem {
  id: string;
  name: string;
  path: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const IMAGE_ACCEPT = "image/png, image/jpeg, image/webp";

/** 全部档位的文案（与设置页同一套说法）；实际可选项由模型能力决定 */
const THINKING_LEVEL_OPTIONS: Array<{
  value: ThinkingLevel;
  label: string;
  /** 紧凑档（停靠栏）工具行上的两字短名 */
  short: string;
  description: string;
}> = [
  { value: "off", label: "立答如流", short: "立答", description: "关闭思考以提升响应速度" },
  { value: "minimal", label: "极简思考", short: "极简", description: "只做最低限度的思考" },
  { value: "low", label: "略作沉吟", short: "略思", description: "轻量推理，少量思考即可作答" },
  {
    value: "medium",
    label: "细致推演",
    short: "细致",
    description: "平衡速度与质量，保持稳健分析",
  },
  { value: "high", label: "穷尽求索", short: "穷尽", description: "深度推理，适合复杂任务" },
  { value: "xhigh", label: "远谋深算", short: "远谋", description: "长程推演，适合复杂代理任务" },
  { value: "max", label: "极尽推演", short: "极尽", description: "使用模型允许的最高推理强度" },
];

/** 调用方没给可选档位时的兜底（模型能力未知，只给各家都有的几档） */
const DEFAULT_THINKING_LEVEL_OPTIONS: readonly ThinkingLevel[] = ["off", "low", "medium", "high"];

const createEmptyEditorContent = (): Descendant[] => [
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  } as Descendant,
];

const extractMentionRefsFromEditorContent = (content: Descendant[]): MentionRef[] => {
  const mentions: MentionRef[] = [];

  const visit = (node: any) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === "content-link") {
      const entityType = node.contentType as MentionEntityType;
      if (entityType === "card" || entityType === "article" || entityType === "project-item") {
        mentions.push({
          entityType,
          entityId: Number(node.refId) || 0,
          contentId: Number(node.contentId) || 0,
          title: String(node.contentTitle || ""),
          previewText: typeof node.previewText === "string" ? node.previewText : "",
        });
      }
      return;
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };

  content.forEach(visit);
  return mentions;
};

/** `$` 点名的 Skill（folderName，去重） */
const extractSkillRefsFromEditorContent = (content: Descendant[]): string[] => {
  const names = new Set<string>();
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "skill-ref" && typeof node.folderName === "string") {
      names.add(node.folderName);
      return;
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  content.forEach(visit);
  return Array.from(names);
};

/** 工具行右侧 chip（模型 / 思考强度）：无底，hover 淡墨；Menu 触发器（透传 props / ref） */
function ToolbarChip({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "text-tau-body text-ink-1 ease-tau-out flex h-[30px] min-w-0 max-w-[200px] shrink-0 items-center gap-1 rounded-[9px] pl-2 pr-1.5 transition-colors duration-[160ms]",
        "enabled:hover:bg-hover disabled:cursor-default disabled:opacity-45",
        "aria-expanded:bg-hover [&_svg]:shrink-0",
        className
      )}
    >
      {children}
    </button>
  );
}

function ChipCaret() {
  return <ChevronDown aria-hidden size={12} strokeWidth={1.75} className="text-ink-3" />;
}

/**
 * 对话输入区（D-048 tau 化 · 二轮 mockups/chat/composer.html）：附件预览 → 编辑器
 * （⌘/Ctrl+Enter 发送、@ 引用内容）→ 工具行：左 ＋（图片 / 文件 / 引用 / 新对话 / MCP 收进
 * 一个向上展开的面板）｜ 右 上下文用量环 · 模型 · 思考强度 · 停止 / 发送，任何宽度都只占一行。
 * 外框（surface + line-1，聚焦 accent 线 + 焦点环）由容器负责，本组件只排内容。
 */
const ChatInputArea = forwardRef<ChatInputAreaHandle, ChatInputAreaProps>(
  (
    {
      className,
      contentEditable = true,
      onPressEnter,
      onSteer,
      onStop,
      placeholder = DEFAULT_CHAT_INPUT_PLACEHOLDER,
      sendLoading = false,
      allowSendWhileLoading = false,
      queuedMessageCount = 0,
      createMessageLoading = false,
      onCreateNewMessage,
      modelGroups = [],
      currentModelKey,
      onModelSelect,
      currentModelName,
      contextWindowK,
      contextUsage,
      isSupportImage = false,
      isSupportFile = false,
      thinkingLevel,
      thinkingLevelOptions,
      onThinkingLevelChange,
      thinkingLevelDisabled = false,
      showMcpManager = true,
      toolScope,
      compact = false,
    },
    ref
  ) => {
    const uploadResourceFn = useUploadResource();

    const services: ChatInputAreaServices = useMemo(
      () => ({
        uploadFile: uploadResourceFn,
        convertFileSrc,
        getHomeDir,
      }),
      [uploadResourceFn]
    );
    const resolvedPlaceholder = useMemo(
      () => resolveChatInputPlaceholder(placeholder),
      [placeholder]
    );

    const { uploadFile, getHomeDir: getChatHomeDir } = services;

    const editorRef = useRef<EditorRef>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const permissionMode = useSettingStore(s =>
      normalizePermissionMode(s.setting.agentPermission?.mode)
    );
    const setPermissionMode = useSettingStore(s => s.setToolPermissionMode);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    const [editorContent, setEditorContent] = useState<Descendant[]>(createEmptyEditorContent);
    const [images, setImages] = useState<ChatImageItem[]>([]);
    const [files, setFiles] = useState<ChatFileItem[]>([]);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);

    const resolveAbsolutePath = useMemoizedFn(async (path: string) => {
      if (path.startsWith("~")) {
        const homeDir = await getChatHomeDir();
        return `${homeDir}${path.slice(1)}`;
      }
      return path;
    });

    const getPreviewUrlFromPath = useMemoizedFn(async (path: string) => {
      if (/^(https?|data):/i.test(path)) {
        return path;
      }
      const absolutePath = await resolveAbsolutePath(path);
      return await convertFileSrc(absolutePath);
    });

    const appendImageAttachment = useMemoizedFn(
      async (attachment: { name: string; path: string }) => {
        let previewUrl = attachment.path;
        try {
          previewUrl = await getPreviewUrlFromPath(attachment.path);
        } catch (error) {
          console.error("生成图片预览失败:", error);
        }
        setImages(prev => [...prev, { id: uuid(), previewUrl, path: attachment.path }]);
      }
    );

    const appendFileAttachment = useMemoizedFn((attachment: { name: string; path: string }) => {
      setFiles(prev => [...prev, { id: uuid(), name: attachment.name, path: attachment.path }]);
    });

    const handleImageUpload = async (file: File) => {
      try {
        setUploadingImage(true);
        const uploadedPath = await uploadFile(file);
        if (!uploadedPath) {
          toast.error("图片上传失败");
          return;
        }
        await appendImageAttachment({ name: file.name, path: uploadedPath });
      } catch (error) {
        console.error("图片上传失败:", error);
        toast.error("图片上传失败");
      } finally {
        setUploadingImage(false);
      }
    };

    const handleFileUpload = async (file: File) => {
      if (
        file.type.toLowerCase().startsWith("audio/") ||
        file.type.toLowerCase().startsWith("video/")
      ) {
        toast.error("暂不支持音视频文件");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error("文件需小于 50MB");
        return;
      }

      try {
        setUploadingPdf(true);
        const localPath = await copyFileToLocal(file);
        appendFileAttachment({ name: file.name, path: localPath });
      } catch (error) {
        console.error("文件上传失败:", error);
        toast.error("文件上传失败");
      } finally {
        setUploadingPdf(false);
      }
    };

    const onPickFiles = (kind: "image" | "file") => (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = "";
      void (async () => {
        for (const file of picked) {
          await (kind === "image" ? handleImageUpload(file) : handleFileUpload(file));
        }
      })();
    };

    const handlePasteCapture = useMemoizedFn((event: React.ClipboardEvent<HTMLDivElement>) => {
      if (sendLoading) return;
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const imageItems = isSupportImage
        ? Array.from(clipboardData.items).filter(
            item => item.kind === "file" && item.type.startsWith("image/")
          )
        : [];
      const fileItems = isSupportFile
        ? Array.from(clipboardData.items).filter(
            item =>
              item.kind === "file" &&
              !item.type.toLowerCase().startsWith("audio/") &&
              !item.type.toLowerCase().startsWith("video/")
          )
        : [];

      if (imageItems.length === 0 && fileItems.length === 0) return;

      event.preventDefault();
      void (async () => {
        for (const item of imageItems) {
          const file = item.getAsFile();
          if (file) await handleImageUpload(file);
        }
        for (const item of fileItems) {
          const file = item.getAsFile();
          if (file) await handleFileUpload(file);
        }
      })();
    });

    const removeImage = useMemoizedFn((imageId: string) => {
      setImages(prev => prev.filter(image => image.id !== imageId));
    });

    const removeFile = useMemoizedFn((fileId: string) => {
      setFiles(prev => prev.filter(file => file.id !== fileId));
    });

    const applyEditorContent = useMemoizedFn((nextContent: Descendant[]) => {
      setEditorContent(nextContent);
      editorRef.current?.setEditorValue(nextContent);
    });

    const hotkeyConfigs = useMemo<IHotKeyConfig[]>(
      () => [
        // 插话（未指定的修饰键按 false 比较，按住 shift 不会误触发送）
        {
          hotKey: "mod+shift+enter",
          action: (_editor, event) => {
            event.preventDefault();
            onSteer?.();
          },
        },
        {
          hotKey: "mod+enter",
          action: (_editor, event) => {
            event.preventDefault();
            onPressEnter?.();
          },
        },
      ],
      [onPressEnter, onSteer]
    );

    useImperativeHandle(ref, () => ({
      getValue: (): MessageContentItem[] => {
        const content: MessageContentItem[] = [];

        images.forEach(image => {
          content.push({
            type: "image",
            image: image.previewUrl,
            path: image.path,
          });
        });

        files.forEach(file => {
          content.push({
            type: "file",
            file: file.path,
            fileName: file.name,
          });
        });

        const text = getMarkdown(editorContent).trim();
        if (text) {
          const skills = extractSkillRefsFromEditorContent(editorContent);
          content.push({
            type: "text",
            text,
            mentions: extractMentionRefsFromEditorContent(editorContent),
            ...(skills.length > 0 ? { skills } : {}),
          });
        }

        return content;
      },
      clear: () => {
        applyEditorContent(createEmptyEditorContent());
        setImages([]);
        setFiles([]);
      },
      setValue: (content: string) => {
        const nextContent = content.trim()
          ? importFromMarkdown(content)
          : createEmptyEditorContent();
        applyEditorContent(nextContent);
      },
      appendMention: mention => {
        const editorHandle = editorRef.current;
        if (!editorHandle) return;

        editorHandle.focus();
        const editor = editorHandle.getEditor();
        wrapContentLink(
          editor,
          mention.contentId,
          mention.entityType,
          mention.title,
          mention.entityId,
          mention.title
        );
        editor.insertText(" ");
      },
      focusEnd: () => {
        editorRef.current?.focus();
      },
    }));

    const showThinkingLevelControl =
      typeof thinkingLevel !== "undefined" && typeof onThinkingLevelChange === "function";
    const availableThinkingLevelOptions = THINKING_LEVEL_OPTIONS.filter(option =>
      (thinkingLevelOptions ?? DEFAULT_THINKING_LEVEL_OPTIONS).includes(option.value)
    );
    const currentThinkingOption = availableThinkingLevelOptions.find(
      option => option.value === thinkingLevel
    );
    const thinkingControlDisabled = thinkingLevelDisabled || sendLoading || !contentEditable;
    const attachDisabled = !contentEditable || sendLoading;
    // 序列化成本随草稿增长，避免每次按键/任意状态变化都全量执行
    const hasText = useMemo(() => getMarkdown(editorContent).trim().length > 0, [editorContent]);

    // ＋ 面板：只列当前宿主真正支持的能力（停靠栏 / 内联 AI 的能力集不同）
    const addItems: ComposerAddItem[] = [
      ...(isSupportImage
        ? [
            {
              key: "image",
              group: "添加",
              icon: <ImagePlus />,
              label: "图片",
              description: "可多选，也可直接粘贴",
              disabled: attachDisabled,
              onSelect: () => imageInputRef.current?.click(),
            },
          ]
        : []),
      ...(isSupportFile
        ? [
            {
              key: "file",
              group: "添加",
              icon: <FileText />,
              label: "文件",
              description: "AI 会自行读取文件内容",
              disabled: attachDisabled,
              onSelect: () => pdfInputRef.current?.click(),
            },
          ]
        : []),
      {
        key: "mention",
        group: "添加",
        icon: <AtSign />,
        label: "引用内容",
        description: "卡片、文章、项目文档",
        kbd: "@",
        disabled: attachDisabled,
        // 等同于在光标处输入 @：交给 content-link 的 @ 面板
        onSelect: () => {
          const editorHandle = editorRef.current;
          if (!editorHandle) return;
          editorHandle.focus();
          window.requestAnimationFrame(() => editorHandle.getEditor().insertText("@"));
        },
      },
      ...(onCreateNewMessage
        ? [
            {
              key: "new-chat",
              group: "对话",
              icon: <SquarePen />,
              label: "新建对话",
              // 不因 sendLoading 禁用：归约运行时是模块级的，上一轮（含等待作答）在后台继续
              description: "当前对话保留在会话列表里",
              disabled: createMessageLoading,
              onSelect: onCreateNewMessage,
            },
          ]
        : []),
      ...(showMcpManager
        ? [
            {
              key: "mcp",
              group: "工具",
              icon: <Plug />,
              label: "MCP 服务器",
              description: "开关外部工具服务",
              disabled: sendLoading,
              panel: (close: () => void) => <McpQuickPanel toolScope={toolScope} onClose={close} />,
            },
          ]
        : []),
    ];

    const canSend =
      (hasText || images.length > 0 || files.length > 0) && (!sendLoading || allowSendWhileLoading);

    const modelMenu =
      modelGroups.length > 0 && onModelSelect ? (
        <Menu
          align="end"
          className="w-[260px]"
          trigger={
            <ToolbarChip
              disabled={sendLoading}
              title={currentModelName || "选择模型"}
              className={compact ? "max-w-[120px] shrink" : "max-w-[200px] shrink"}
            >
              <span className="min-w-0 truncate font-medium">{currentModelName || "选择模型"}</span>
              <ChipCaret />
            </ToolbarChip>
          }
        >
          <Menu.RadioGroup value={currentModelKey} onValueChange={key => onModelSelect({ key })}>
            {modelGroups.map((group, index) => (
              <div key={group.key}>
                {index > 0 && <Menu.Separator />}
                <Menu.Group>{group.label}</Menu.Group>
                {(group.children ?? []).map(model => (
                  <Menu.RadioItem
                    key={model.key}
                    value={model.key}
                    className={model.description ? "h-auto min-h-[34px] py-1.5" : undefined}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{model.label}</span>
                      {model.description && (
                        <span className="text-tau-tiny text-ink-3 truncate">
                          {model.description}
                        </span>
                      )}
                    </span>
                  </Menu.RadioItem>
                ))}
              </div>
            ))}
          </Menu.RadioGroup>
        </Menu>
      ) : null;

    const thinkingMenu = showThinkingLevelControl ? (
      <Menu
        align="end"
        // 双行选项 ×5 超出 Menu 默认 300px 上限；选项数固定，放开高度免出滚动条
        className="max-h-none w-[240px]"
        trigger={
          <ToolbarChip disabled={thinkingControlDisabled} title="思考强度">
            <Brain size={15} strokeWidth={1.75} className="text-ink-2" />
            <span className="min-w-0 truncate">
              {(compact ? currentThinkingOption?.short : currentThinkingOption?.label) ??
                (compact ? "立答" : "立答如流")}
            </span>
            <ChipCaret />
          </ToolbarChip>
        }
      >
        <Menu.Group>思考强度</Menu.Group>
        <Menu.RadioGroup
          value={thinkingLevel}
          onValueChange={value => onThinkingLevelChange?.(value as ThinkingLevel)}
        >
          {availableThinkingLevelOptions.map(option => (
            <Menu.RadioItem key={option.value} value={option.value} className="h-auto py-1.5">
              <span className="flex min-w-0 flex-col">
                <span>{option.label}</span>
                <span className="text-tau-tiny text-ink-3 truncate">{option.description}</span>
              </span>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu>
    ) : null;

    // 工具权限模式（D-060）：只在完整对话输入框出现（行内 AI 等不跑需要确认的工具）
    const currentPermission = TOOL_PERMISSION_MODES.find(m => m.value === permissionMode);
    const permissionMenu = showMcpManager ? (
      <Menu
        align="start"
        className="max-h-none w-[260px]"
        trigger={
          <ToolbarChip title={`工具权限：${currentPermission?.label ?? ""}`}>
            {permissionMode === "bypass" ? (
              <ShieldOff size={15} strokeWidth={1.75} className="text-warn" />
            ) : (
              <ShieldCheck size={15} strokeWidth={1.75} className="text-ink-2" />
            )}
            {!compact && <span className="min-w-0 truncate">{currentPermission?.short}</span>}
            <ChipCaret />
          </ToolbarChip>
        }
      >
        <Menu.Group>工具权限</Menu.Group>
        <Menu.RadioGroup
          value={permissionMode}
          onValueChange={value => setPermissionMode(value as ToolPermissionMode)}
        >
          {TOOL_PERMISSION_MODES.map(option => (
            <Menu.RadioItem key={option.value} value={option.value} className="h-auto py-1.5">
              <span className="flex min-w-0 flex-col">
                <span>{option.label}</span>
                <span className="text-tau-tiny text-ink-3 truncate">{option.description}</span>
              </span>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu>
    ) : null;

    return (
      <div ref={rootRef} className={cn("flex flex-col", className)}>
        <SkillPickerPanel composerRef={rootRef} />
        {(images.length > 0 || files.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div key={image.id} className="group/att relative size-14">
                <img
                  src={image.previewUrl}
                  alt={`预览 ${index + 1}`}
                  className="border-line-1 rounded-tau-sm size-14 cursor-zoom-in border object-cover"
                  onClick={() => setPreviewIndex(index)}
                />
                <button
                  type="button"
                  aria-label="移除图片"
                  onClick={() => removeImage(image.id)}
                  className="bg-ink-1/70 text-ink-inverse absolute -right-1.5 -top-1.5 grid size-[18px] place-items-center rounded-full opacity-0 transition-opacity group-hover/att:opacity-100"
                >
                  <X size={11} strokeWidth={2.25} />
                </button>
              </div>
            ))}
            {files.map(file => (
              <div
                key={file.id}
                className="border-line-1 bg-surface group/att rounded-tau-sm flex h-8 max-w-[240px] items-center gap-1.5 border pl-2 pr-1"
              >
                <FileText size={14} strokeWidth={1.75} className="text-danger shrink-0" />
                <span className="text-tau-sm text-ink-1 min-w-0 truncate">{file.name}</span>
                <IconButton
                  aria-label="移除文件"
                  className="size-5 [&_svg]:size-3"
                  onClick={() => removeFile(file.id)}
                >
                  <X strokeWidth={2} />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn("px-0.5", !contentEditable && "opacity-60")}
          onPasteCapture={handlePasteCapture}
        >
          <div className="max-h-[min(240px,34vh)] overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
            <Editor
              kit={getChatInputKit()}
              ref={editorRef}
              initValue={editorContent}
              onChange={value => {
                setEditorContent(value);
              }}
              readonly={!contentEditable}
              hotkeyConfigs={hotkeyConfigs}
              placeHolder={resolvedPlaceholder}
              // 段落拖拽手柄绝对定位且高于行高：裁剪溢出，避免未到最大高度就出现滚动条。
              // 不设 min-height：空态 Slate 以内联 min-height（= 占位符高度）盖过类名，
              // 一输入占位符消失、类名生效，单行下方凭空多出空白
              className="text-tau-body-lg overflow-hidden"
            />
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-1">
          <ComposerAddMenu
            items={addItems}
            busy={uploadingImage || uploadingPdf}
            disabled={!contentEditable}
          />
          {permissionMenu}
          <span className="min-w-1 flex-1" />
          <ContextUsageRing contextWindowK={contextWindowK} usage={contextUsage} />
          {modelMenu}
          {thinkingMenu}
          {sendLoading && (
            <Tooltip content="停止生成" placement="top" delay={300}>
              <button
                type="button"
                aria-label="停止生成"
                onClick={onStop}
                className="bg-ink-1 text-surface ml-1 grid size-[30px] shrink-0 place-items-center rounded-[10px] hover:opacity-90"
              >
                <Square size={11} strokeWidth={0} fill="currentColor" />
              </button>
            </Tooltip>
          )}
          {onSteer && (
            <Tooltip
              content="插话：当前步骤结束后交给模型（⌘/Ctrl + Shift + Enter）"
              placement="top"
              delay={300}
            >
              <button
                type="button"
                aria-label="插话"
                onClick={onSteer}
                disabled={!hasText && images.length === 0 && files.length === 0}
                className={cn(
                  "ease-tau-out border-line-1 text-ink-2 ml-1 grid size-[30px] shrink-0 place-items-center rounded-[10px] border transition-[background,color] duration-[160ms]",
                  "enabled:hover:bg-hover enabled:hover:text-ink-1 disabled:text-ink-3 disabled:cursor-default"
                )}
              >
                <CornerDownRight size={15} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
          {(!sendLoading || allowSendWhileLoading) && (
            <Tooltip
              content={sendLoading ? "加入发送队列（⌘/Ctrl + Enter）" : "发送（⌘/Ctrl + Enter）"}
              placement="top"
              delay={300}
            >
              <button
                type="button"
                aria-label={sendLoading ? "加入发送队列" : "发送"}
                onClick={onPressEnter}
                disabled={!canSend}
                className={cn(
                  "ease-tau-out relative ml-1 grid size-[30px] shrink-0 place-items-center rounded-[10px] transition-[background,color] duration-[160ms]",
                  // 不可发送 = 淡墨方钮（不用半透明 accent：一大块淡橙比文字还抢眼）
                  "bg-accent text-ink-inverse enabled:hover:bg-accent-hover disabled:bg-hover disabled:text-ink-3 disabled:cursor-default"
                )}
              >
                <ArrowUp size={16} strokeWidth={2.25} />
                {queuedMessageCount > 0 && (
                  <span className="bg-ink-1 text-ink-inverse absolute -right-1.5 -top-1.5 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold tabular-nums leading-4">
                    {queuedMessageCount}
                  </span>
                )}
              </button>
            </Tooltip>
          )}
        </div>

        {isSupportImage && (
          <input
            ref={imageInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={onPickFiles("image")}
          />
        )}
        {isSupportFile && (
          <input
            ref={pdfInputRef}
            type="file"
            accept="*/*"
            className="hidden"
            onChange={onPickFiles("file")}
          />
        )}

        <ImagePreview
          images={images.map((image, index) => ({
            src: image.previewUrl,
            alt: `预览 ${index + 1}`,
          }))}
          index={previewIndex ?? 0}
          onIndexChange={setPreviewIndex}
          open={previewIndex !== null}
          onOpenChange={open => !open && setPreviewIndex(null)}
        />
      </div>
    );
  }
);

ChatInputArea.displayName = "ChatInputArea";

export default ChatInputArea;
