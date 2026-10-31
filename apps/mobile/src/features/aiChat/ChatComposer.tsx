// 输入区是两行的一体卡片：上行写字，下行左边 ＋、「引用笔记」与思考强度，右下角一个位置三种状态——
// 生成中为停止、有文字或附件为发送、否则为语音 / 键盘切换。待发送的引用与图片挂在卡片第一行。
// 语音模式与微信一致：上行换成「按住 说话」，松手发送；再点键盘图标回到打字并弹出键盘。

import { useRef, useState } from "react";
import {
  ArrowUp,
  AtSign,
  Brain,
  Camera,
  Image as ImageIcon,
  Keyboard,
  Mic,
  Plus,
  Square,
  X,
} from "lucide-react";
import { cn } from "@tau/ui";
import { THINKING_LEVEL_OPTIONS, type MentionRef, type ThinkingLevel } from "@tau/shared/chat-core";
import { ActionSheet } from "../../components/ActionSheet";
import {
  resolveExpectedKeyboardHeight,
  useKeyboardReservation,
  useKeyboardViewport,
} from "../../components/KeyboardViewportProvider";
import { toast } from "../../components/toast";
import type { ChatInput } from "../../services/aiChat/chatController";
import { ContentLinkPickerSheet } from "../cards/editorExtensions/ContentLinkPickerSheet";
import { imageFileToDataUrl, mentionFromPicker } from "./attachments";
import { MentionChip } from "./ChatMessages";
import { HoldToTalkBar } from "./VoiceSendButton";

const ROUND_BUTTON =
  "grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full transition-transform active:scale-90";
/** 下排工具：细描边圆钮 / 胶囊，与右侧主按钮区分轻重 */
const TOOL_BUTTON =
  "border-line-2 text-ink-2 flex h-[34px] shrink-0 items-center justify-center rounded-full border transition-transform active:scale-95";
const MAX_IMAGES = 4;

export function ChatComposer(props: {
  running: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** 当前模型是否接受图片；不接受时拍照 / 相册置灰 */
  imageInput?: boolean;
  /** 待发送的引用（就近提问的选中片段 / 整篇）；由宿主持有，发送后清空 */
  mentions?: MentionRef[];
  onMentionsChange?(mentions: MentionRef[]): void;
  /** 引用存在且没写字时，输入框下方的快捷问法 */
  quickPrompts?: string[];
  /** 思考强度：当前模型可选不止一档时才传，下排显示档位胶囊 */
  thinking?: {
    level: ThinkingLevel;
    options: readonly ThinkingLevel[];
    onPick(level: ThinkingLevel): void;
  };
  onSend(input: ChatInput): void;
  onStop(): void;
}) {
  const [value, setValue] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [localMentions, setLocalMentions] = useState<MentionRef[]>([]);
  const [plusOpen, setPlusOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reservation = useKeyboardReservation();
  const keyboardViewport = useKeyboardViewport();
  // 聚焦前先按预计键盘高度收起外壳，输入框在键盘升起前已在其上方，iOS 就不会平移整页把顶栏推出屏幕；
  // 键盘升到预留高度（或超时）后释放，之后按真实键盘布局
  const liftAboveKeyboard = () => {
    if (keyboardViewport.isKeyboardVisible) return;
    reservation.reserve(resolveExpectedKeyboardHeight(keyboardViewport));
    reservation.releaseWhenKeyboardShown();
  };
  const focusInput = () => {
    liftAboveKeyboard();
    inputRef.current?.focus();
  };
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const mentions = props.mentions ?? localMentions;
  const { thinking } = props;
  const thinkingOption = THINKING_LEVEL_OPTIONS.find(option => option.value === thinking?.level);
  const setMentions = props.onMentionsChange ?? setLocalMentions;
  const text = value.trim();
  const hasPayload = !!text || images.length > 0;
  // 语音模式下只有图片（没写字）时也走「按住说话」，图片随这条语音一起发出
  const showSend = hasPayload && !(voiceMode && !text);

  const send = (input: ChatInput) => {
    if (props.running || props.disabled) return;
    props.onSend(input);
    setValue("");
    setImages([]);
    setMentions([]);
    // 发送后收起键盘，让回答占满屏幕
    inputRef.current?.blur();
  };
  const submit = () => {
    if (!hasPayload) return;
    send({ text, mentions, images });
  };

  const addImages = async (files: FileList | null) => {
    const list = [...(files ?? [])].slice(0, MAX_IMAGES - images.length);
    if (!list.length) return;
    try {
      const urls = await Promise.all(list.map(imageFileToDataUrl));
      setImages(current => [...current, ...urls].slice(0, MAX_IMAGES));
    } catch {
      toast.error("图片读取失败");
    }
  };

  const imageHint =
    props.imageInput === false
      ? "当前模型不支持图片，先在顶部换一个带图片能力的模型"
      : images.length >= MAX_IMAGES
        ? `一次最多 ${MAX_IMAGES} 张`
        : undefined;
  const pickImage = (ref: typeof cameraRef) => {
    if (imageHint) return toast.info({ text: imageHint });
    ref.current?.click();
  };

  const trailing = props.running ? (
    <button
      type="button"
      aria-label="停止生成"
      onClick={props.onStop}
      className={cn(ROUND_BUTTON, "bg-ink-1 text-ink-inverse")}
    >
      <Square size={13} fill="currentColor" aria-hidden="true" />
    </button>
  ) : showSend ? (
    <button
      type="button"
      aria-label="发送"
      disabled={props.disabled}
      onClick={submit}
      className={cn(ROUND_BUTTON, "bg-accent text-ink-inverse disabled:opacity-50")}
    >
      <ArrowUp size={18} strokeWidth={2.4} aria-hidden="true" />
    </button>
  ) : voiceMode ? (
    <button
      type="button"
      aria-label="切换到键盘"
      onClick={() => {
        setVoiceMode(false);
        // 在点击里同步聚焦，移动端才会弹出键盘
        focusInput();
      }}
      className={cn(ROUND_BUTTON, "bg-page text-ink-1")}
    >
      <Keyboard size={18} aria-hidden="true" />
    </button>
  ) : (
    <button
      type="button"
      aria-label="切换到语音输入"
      onClick={() => {
        inputRef.current?.blur();
        setVoiceMode(true);
      }}
      className={cn(ROUND_BUTTON, "bg-page text-ink-1")}
    >
      <Mic size={18} aria-hidden="true" />
    </button>
  );

  return (
    <div
      // 输入区由外壳贴在键盘上沿，本就可见；自动露出会对它 scrollIntoView，把整页往上卷
      data-kb-optout="true"
      className="bg-page shrink-0 px-3 pt-2"
      style={{ paddingBottom: "calc(var(--mobile-screen-safe-bottom) + 10px)" }}
    >
      {mentions.length > 0 && !hasPayload && !props.running && props.quickPrompts?.length ? (
        <div className="scrollbar-hide -mx-3 mb-2 flex gap-2 overflow-x-auto px-3">
          {props.quickPrompts.map(prompt => (
            <button
              key={prompt}
              type="button"
              disabled={props.disabled}
              onClick={() => send({ text: prompt, mentions })}
              className="bg-surface text-ink-2 text-tau-sm h-[30px] shrink-0 rounded-full px-3 transition-transform active:scale-95"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
      <div className="bg-surface shadow-card rounded-[26px] pt-3 pr-2.5 pb-2.5 pl-3.5">
        {(mentions.length > 0 || images.length > 0) && (
          <div className="scrollbar-hide mb-2.5 flex items-center gap-2 overflow-x-auto">
            {mentions.map((mention, index) => (
              <MentionChip
                key={`${mention.contentId}:${index}`}
                mention={mention}
                onRemove={() => setMentions(mentions.filter((_, other) => other !== index))}
              />
            ))}
            {images.map((image, index) => (
              <span key={index} className="relative h-12 w-12 shrink-0">
                <img src={image} alt="" className="h-12 w-12 rounded-xl object-cover" />
                <button
                  type="button"
                  aria-label="去掉图片"
                  onClick={() => setImages(images.filter((_, other) => other !== index))}
                  className="bg-ink-1 text-ink-inverse absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        {voiceMode ? (
          <div className="mr-1 flex">
            <HoldToTalkBar
              disabled={props.disabled || props.running}
              onSend={spoken => send({ text: spoken, mentions, images })}
            />
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          rows={1}
          hidden={voiceMode}
          value={value}
          placeholder={props.placeholder ?? "发消息"}
          onPointerDown={() => {
            if (document.activeElement !== inputRef.current) liftAboveKeyboard();
          }}
          onChange={event => {
            const next = event.currentTarget.value;
            // 输入 @ 直接打开笔记选择，@ 本身不留在正文里
            if (next.length === value.length + 1 && next.endsWith("@")) {
              setValue(next.slice(0, -1));
              setPickerOpen(true);
              return;
            }
            setValue(next);
          }}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="text-ink-1 placeholder:text-ink-3 block field-sizing-content max-h-36 min-h-6 w-full resize-none bg-transparent pr-2 text-[15.5px] leading-normal outline-none"
        />
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            aria-label="添加图片或引用"
            onClick={() => setPlusOpen(true)}
            className={cn(TOOL_BUTTON, "w-[34px]")}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="引用笔记"
            onClick={() => setPickerOpen(true)}
            className={cn(TOOL_BUTTON, "text-tau-sm gap-1 pr-3 pl-2.5")}
          >
            <AtSign size={15} aria-hidden="true" />
            引用笔记
          </button>
          {thinking && (
            <button
              type="button"
              aria-label={`思考强度：${thinkingOption?.label ?? ""}`}
              disabled={props.running}
              onClick={() => setThinkingOpen(true)}
              className={cn(TOOL_BUTTON, "text-tau-sm gap-1 pr-3 pl-2.5 disabled:opacity-50")}
            >
              <Brain size={15} aria-hidden="true" />
              {thinkingOption?.short ?? "立答"}
            </button>
          )}
          <span className="flex-1" />
          {trailing}
        </div>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={event => {
          void addImages(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={event => {
          void addImages(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <ActionSheet
        open={plusOpen}
        items={[
          {
            label: "拍照提问",
            icon: <Camera size={18} />,
            desc: imageHint,
            onClick: () => pickImage(cameraRef),
          },
          {
            label: "从相册选",
            icon: <ImageIcon size={18} />,
            desc: imageHint,
            onClick: () => pickImage(albumRef),
          },
          {
            label: "引用笔记",
            icon: <AtSign size={18} />,
            onClick: () => setPickerOpen(true),
          },
        ]}
        onClose={() => setPlusOpen(false)}
      />
      {thinking && (
        <ActionSheet
          open={thinkingOpen}
          title="思考强度"
          subtitle="想得越多回答越慢；记在本机，所有对话共用"
          items={THINKING_LEVEL_OPTIONS.filter(option =>
            thinking.options.includes(option.value)
          ).map(option => ({
            key: option.value,
            label: option.label,
            desc: option.description,
            selected: option.value === thinking.level,
            onClick: () => thinking.onPick(option.value),
          }))}
          onClose={() => setThinkingOpen(false)}
        />
      )}
      <ContentLinkPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={result => {
          const mention = mentionFromPicker(result);
          if (!mentions.some(item => !item.quote && item.contentId === mention.contentId))
            setMentions([...mentions, mention]);
          setPickerOpen(false);
          focusInput();
        }}
      />
    </div>
  );
}
