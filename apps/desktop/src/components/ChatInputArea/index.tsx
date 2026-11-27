import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createDesktopKit } from "@/services/editorKit";
import type { EditorKit } from "@tau/editor";
import { useMemoizedFn } from "ahooks";
import {
  ArrowUp,
  AtSign,
  Brain,
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
import type { ChatCompactionUsage } from "@tau/shared/chat-core";
import type { Descendant } from "slate";

import { Editor, type EditorRef, type IHotKeyConfig } from "@tau/editor";
import {
  resolveChatInputPlaceholder,
  type ChatInputAreaHandle,
  type MentionEntityType,
  type MentionRef,
  type MessageContentItem,
  type ThinkingLevel,
  type ChatContextUsage,
  ChipCaret,
  ComposerAddMenu,
  ContextUsageRing,
  ToolbarChip,
  type ComposerAddItem,
} from "@tau/shared";
import { DEFAULT_THINKING_LEVEL_OPTIONS, THINKING_LEVEL_OPTIONS } from "@tau/shared/chat-core";
import { IconButton, ImagePreview, Menu, Tooltip, cn, toast } from "@tau/ui";

import {
  CHAT_IMAGE_ACCEPT,
  ChatAttachmentError,
  prepareChatAttachment,
  type ChatAttachment,
} from "./attachments";
import { useComposerI18n } from "./i18n";
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

export type { ChatInputAreaHandle };

/** 聊天输入场景（ER-016）：只要引用能力，不要content 专属块 */
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
  compaction?: ChatCompactionUsage;
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

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;

    if (record.type === "content-link") {
      const entityType = record.contentType as MentionEntityType;
      if (entityType === "card" || entityType === "article" || entityType === "project-item") {
        mentions.push({
          entityType,
          entityId: Number(record.refId) || 0,
          contentId: Number(record.contentId) || 0,
          title: String(record.contentTitle || ""),
          previewText: typeof record.previewText === "string" ? record.previewText : "",
        });
      }
      return;
    }

    if (Array.isArray(record.children)) {
      record.children.forEach(visit);
    }
  };

  content.forEach(visit);
  return mentions;
};

/** `$` 点名的 Skill（folderName，去重） */
const extractSkillRefsFromEditorContent = (content: Descendant[]): string[] => {
  const names = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "skill-ref" && typeof record.folderName === "string") {
      names.add(record.folderName);
      return;
    }
    if (Array.isArray(record.children)) record.children.forEach(visit);
  };
  content.forEach(visit);
  return Array.from(names);
};

/** 工具行右侧 chip（模型 / 思考强度）：无底，hover 淡墨；Menu 触发器（透传 props / ref） */
/**
 * 对话输入区：附件预览 → 编辑器
 * （Enter 发送、Shift+Enter 换段、@ 引用内容）→ 工具行：左 ＋（图片 / 文件 / 引用 / 新对话 / MCP 收进
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
      placeholder,
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
      compaction,
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
    const { t, locale } = useComposerI18n();
    const number = (value: number) => new Intl.NumberFormat(locale).format(value);
    const resolvedPlaceholder = resolveChatInputPlaceholder(placeholder ?? t("input.placeholder"));

    const editorRef = useRef<EditorRef>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const permissionMode = useSettingStore(s =>
      normalizePermissionMode(s.setting.agentPermission?.mode)
    );
    const setPermissionMode = useSettingStore(s => s.setToolPermissionMode);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [editorContent, setEditorContent] = useState<Descendant[]>(createEmptyEditorContent);
    const [editorRevision, setEditorRevision] = useState(0);
    const restoreEditorFocus = useRef(false);
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const images = attachments.filter(item => item.type === "image");
    const files = attachments.filter(item => item.type === "file");
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [pendingBatches, setPendingBatches] = useState(0);
    const draftRevision = useRef(0);
    const attachDisabled = !contentEditable || sendLoading;

    const addFiles = async (picked: File[], source: "pick" | "paste" | "drop") => {
      if (attachDisabled || !picked.length) return;
      const revision = draftRevision.current;
      setPendingBatches(count => count + 1);
      try {
        for (const file of picked) {
          if (revision !== draftRevision.current) break;
          try {
            const item = await prepareChatAttachment(file, source, isSupportImage, isSupportFile);
            if (revision === draftRevision.current) setAttachments(prev => [...prev, item]);
          } catch (error) {
            toast.error(
              error instanceof ChatAttachmentError
                ? t(error.code, error.params)
                : error instanceof Error
                  ? error.message
                  : t("attachment.failed")
            );
          }
        }
      } finally {
        setPendingBatches(count => count - 1);
      }
    };

    const onPickFiles = (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = "";
      void addFiles(picked, "pick");
    };

    const handlePasteCapture = (event: React.ClipboardEvent<HTMLDivElement>) => {
      const picked = Array.from(event.clipboardData.files);
      if (!picked.length) {
        for (const item of event.clipboardData.items) {
          const file = item.kind === "file" ? item.getAsFile() : null;
          if (file) picked.push(file);
        }
      }
      if (!picked.length) return;
      event.preventDefault();
      event.stopPropagation();
      void addFiles(picked, "paste");
    };

    const handleDropCapture = (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.stopPropagation();
      void addFiles(Array.from(event.dataTransfer.files), "drop");
    };

    const removeAttachment = (id: string) => {
      setAttachments(prev => prev.filter(item => item.id !== id));
    };

    const applyEditorContent = useMemoizedFn((nextContent: Descendant[]) => {
      restoreEditorFocus.current = editorRef.current?.isFocus() ?? false;
      setEditorContent(nextContent);
      setEditorRevision(revision => revision + 1);
    });

    const hotkeyConfigs = useMemo<IHotKeyConfig[]>(
      () => [
        // 插话（未指定的修饰键按 false 比较，按住 shift 不会误触发送）
        {
          hotKey: "mod+shift+enter",
          action: (_editor, event) => {
            event.preventDefault();
            if (!pendingBatches) onSteer?.();
          },
        },
        {
          hotKey: ["enter", "mod+enter"],
          action: (_editor, event) => {
            event.preventDefault();
            if (!pendingBatches) onPressEnter?.();
          },
        },
        {
          hotKey: "shift+enter",
          action: (editor, event) => {
            event.preventDefault();
            editor.insertBreak();
          },
        },
      ],
      [onPressEnter, onSteer, pendingBatches]
    );

    useImperativeHandle(ref, () => ({
      getValue: (): MessageContentItem[] => {
        const content: MessageContentItem[] = [];

        for (const item of attachments) {
          if (item.type === "image" && isSupportImage) {
            content.push({ type: "image", image: item.previewUrl, path: item.path });
          } else {
            content.push({ type: "file", file: item.path, fileName: item.name });
          }
        }

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
        draftRevision.current++;
        setAttachments([]);
        setPreviewIndex(null);
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
        restoreEditorFocus.current = true;
        editorRef.current?.focus();
      },
    }));

    const showThinkingLevelControl =
      typeof thinkingLevel !== "undefined" && typeof onThinkingLevelChange === "function";
    const availableThinkingLevelOptions = THINKING_LEVEL_OPTIONS.filter(option =>
      (thinkingLevelOptions ?? DEFAULT_THINKING_LEVEL_OPTIONS).includes(option.value)
    ).map(option => ({
      value: option.value,
      label: t(`thinking.${option.value}.label`),
      short: t(`thinking.${option.value}.short`),
      description: t(`thinking.${option.value}.description`),
    }));
    const currentThinkingOption = availableThinkingLevelOptions.find(
      option => option.value === thinkingLevel
    );
    const thinkingControlDisabled = thinkingLevelDisabled || sendLoading || !contentEditable;
    // 序列化成本随草稿增长，避免每次按键/任意状态变化都全量执行
    const hasText = useMemo(() => getMarkdown(editorContent).trim().length > 0, [editorContent]);

    // ＋ 面板：只列当前宿主真正支持的能力（停靠栏 / 内联 AI 的能力集不同）
    const addItems: ComposerAddItem[] = [
      ...(isSupportImage
        ? [
            {
              key: "image",
              group: t("group.add"),
              icon: <ImagePlus />,
              label: t("add.image"),
              description: t("add.imageHint"),
              disabled: attachDisabled,
              onSelect: () => imageInputRef.current?.click(),
            },
          ]
        : []),
      ...(isSupportFile
        ? [
            {
              key: "file",
              group: t("group.add"),
              icon: <FileText />,
              label: t("add.file"),
              description: t("add.fileHint"),
              disabled: attachDisabled,
              onSelect: () => fileInputRef.current?.click(),
            },
          ]
        : []),
      {
        key: "mention",
        group: t("group.add"),
        icon: <AtSign />,
        label: t("add.mention"),
        description: t("add.mentionHint"),
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
              group: t("group.chat"),
              icon: <SquarePen />,
              label: t("add.chat"),
              // 不因 sendLoading 禁用：归约运行时是模块级的，上一轮（含等待作答）在后台继续
              description: t("add.chatHint"),
              disabled: createMessageLoading,
              onSelect: onCreateNewMessage,
            },
          ]
        : []),
      ...(showMcpManager
        ? [
            {
              key: "mcp",
              group: t("group.tools"),
              icon: <Plug />,
              label: t("add.mcp"),
              description: t("add.mcpHint"),
              disabled: sendLoading,
              panel: (close: () => void) => <McpQuickPanel toolScope={toolScope} onClose={close} />,
            },
          ]
        : []),
    ];

    const canSend =
      !pendingBatches &&
      (hasText || attachments.length > 0) &&
      (!sendLoading || allowSendWhileLoading);

    const modelMenu =
      modelGroups.length > 0 && onModelSelect ? (
        <Menu
          align="end"
          className="w-[260px]"
          trigger={
            <ToolbarChip
              disabled={sendLoading}
              title={currentModelName ?? t("model.select")}
              className={compact ? "max-w-[120px] shrink" : "max-w-[200px] shrink"}
            >
              <span className="min-w-0 truncate font-medium">
                {currentModelName ?? t("model.select")}
              </span>
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
          <ToolbarChip disabled={thinkingControlDisabled} title={t("thinking.title")}>
            <Brain size={15} strokeWidth={1.75} className="text-ink-2" />
            <span className="min-w-0 truncate">
              {(compact ? currentThinkingOption?.short : currentThinkingOption?.label) ??
                (compact ? t("thinking.off.short") : t("thinking.off.label"))}
            </span>
            <ChipCaret />
          </ToolbarChip>
        }
      >
        <Menu.Group>{t("thinking.title")}</Menu.Group>
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

    // 工具权限模式：只在完整对话输入框出现（行内 AI 等不跑需要确认的工具）
    const permissionOptions = TOOL_PERMISSION_MODES.map(option => ({
      value: option.value,
      label: t(`permission.${option.value}.label`),
      short: t(`permission.${option.value}.short`),
      description: t(`permission.${option.value}.description`),
    }));
    const currentPermission = permissionOptions.find(m => m.value === permissionMode);
    const permissionMenu = showMcpManager ? (
      <Menu
        align="start"
        className="max-h-none w-[260px]"
        trigger={
          <ToolbarChip title={t("permission.current", { label: currentPermission?.label ?? "" })}>
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
        <Menu.Group>{t("permission.title")}</Menu.Group>
        <Menu.RadioGroup
          value={permissionMode}
          onValueChange={value => setPermissionMode(value as ToolPermissionMode)}
        >
          {permissionOptions.map(option => (
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
      <div
        ref={rootRef}
        className={cn("flex flex-col", className)}
        onPasteCapture={handlePasteCapture}
        onDragOverCapture={event => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = attachDisabled ? "none" : "copy";
        }}
        onDropCapture={handleDropCapture}
      >
        <SkillPickerPanel composerRef={rootRef} />
        {(images.length > 0 || files.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div key={image.id} className="group/att relative size-14">
                <img
                  src={image.previewUrl}
                  alt={t("preview.image", { number: number(index + 1) })}
                  className="border-line-1 rounded-tau-sm size-14 cursor-zoom-in border object-cover"
                  onClick={() => setPreviewIndex(index)}
                />
                <button
                  type="button"
                  aria-label={t("remove.image")}
                  onClick={() => removeAttachment(image.id)}
                  className="bg-ink-1/70 text-ink-inverse absolute -top-1.5 -right-1.5 grid size-[18px] place-items-center rounded-full opacity-0 transition-opacity group-hover/att:opacity-100"
                >
                  <X size={11} strokeWidth={2.25} />
                </button>
              </div>
            ))}
            {files.map(file => (
              <div
                key={file.id}
                className="border-line-1 bg-surface group/att rounded-tau-sm flex h-8 max-w-[240px] items-center gap-1.5 border pr-1 pl-2"
              >
                <FileText size={14} strokeWidth={1.75} className="text-danger shrink-0" />
                <span className="text-tau-sm text-ink-1 min-w-0 truncate">{file.name}</span>
                <IconButton
                  aria-label={t("remove.file")}
                  className="size-5 [&_svg]:size-3"
                  onClick={() => removeAttachment(file.id)}
                >
                  <X strokeWidth={2} />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        <div className={cn("px-0.5", !contentEditable && "opacity-60")}>
          <div className="max-h-[min(240px,34vh)] overflow-x-hidden overflow-y-auto overscroll-contain pr-1">
            <Editor
              key={editorRevision}
              onInit={() => {
                if (restoreEditorFocus.current) editorRef.current?.focus();
                restoreEditorFocus.current = false;
              }}
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
          <ComposerAddMenu items={addItems} busy={pendingBatches > 0} disabled={!contentEditable} />
          {permissionMenu}
          <span className="min-w-1 flex-1" />
          <ContextUsageRing
            contextWindowK={contextWindowK}
            usage={contextUsage}
            compaction={compaction}
          />
          {modelMenu}
          {thinkingMenu}
          {sendLoading && (
            <Tooltip content={t("action.stop")} placement="top" delay={300}>
              <button
                type="button"
                aria-label={t("action.stop")}
                onClick={onStop}
                className="bg-ink-1 text-surface ml-1 grid size-[30px] shrink-0 place-items-center rounded-[10px] hover:opacity-90"
              >
                <Square size={11} strokeWidth={0} fill="currentColor" />
              </button>
            </Tooltip>
          )}
          {onSteer && (
            <Tooltip content={t("action.steerHint")} placement="top" delay={300}>
              <button
                type="button"
                aria-label={t("action.steer")}
                onClick={onSteer}
                disabled={!!pendingBatches || (!hasText && !attachments.length)}
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
              content={sendLoading ? t("action.queueHint") : t("action.sendHint")}
              placement="top"
              delay={300}
            >
              <button
                type="button"
                aria-label={sendLoading ? t("action.queue") : t("action.send")}
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
                  <span className="bg-ink-1 text-ink-inverse absolute -top-1.5 -right-1.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold tabular-nums">
                    {number(queuedMessageCount)}
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
            accept={CHAT_IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={onPickFiles}
          />
        )}
        {isSupportFile && (
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            multiple
            className="hidden"
            onChange={onPickFiles}
          />
        )}

        <ImagePreview
          images={images.map((image, index) => ({
            src: image.previewUrl,
            alt: t("preview.image", { number: number(index + 1) }),
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
