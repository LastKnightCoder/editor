// 输入区：右侧一个位置三种状态——空内容为按住说话、有文字或附件为发送、生成中为停止。
// 输入框上方是待发送的引用条与图片；左侧 ＋ 打开拍照 / 相册 / 引用笔记，@ 直接引用笔记。

import { useRef, useState } from "react";
import { ArrowUp, AtSign, Camera, Image as ImageIcon, Mic, Plus, Square, X } from "lucide-react";
import { cn } from "@tau/ui";
import type { MentionRef } from "@tau/shared/chat-core";
import { ActionSheet } from "../../components/ActionSheet";
import { toast } from "../../components/toast";
import type { ChatInput } from "../../services/aiChat/chatController";
import { ContentLinkPickerSheet } from "../cards/editorExtensions/ContentLinkPickerSheet";
import { imageFileToDataUrl, mentionFromPicker } from "./attachments";
import { MentionQuote } from "./ChatMessages";
import { VoiceSendButton } from "./VoiceSendButton";

const ROUND_BUTTON =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform active:scale-90";
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
  onSend(input: ChatInput): void;
  onStop(): void;
}) {
  const [value, setValue] = useState("");
  const [voicePreview, setVoicePreview] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [localMentions, setLocalMentions] = useState<MentionRef[]>([]);
  const [plusOpen, setPlusOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const mentions = props.mentions ?? localMentions;
  const setMentions = props.onMentionsChange ?? setLocalMentions;
  const text = value.trim();
  const hasPayload = !!text || images.length > 0;

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
  ) : hasPayload ? (
    <button
      type="button"
      aria-label="发送"
      disabled={props.disabled}
      onClick={submit}
      className={cn(ROUND_BUTTON, "bg-accent text-ink-inverse disabled:opacity-50")}
    >
      <ArrowUp size={18} strokeWidth={2.4} aria-hidden="true" />
    </button>
  ) : (
    <VoiceSendButton
      disabled={props.disabled}
      onSend={spoken => send({ text: spoken, mentions })}
      onPreview={setVoicePreview}
      renderButton={({ bind, active }) => (
        <button
          type="button"
          aria-label="按住说话"
          aria-pressed={active}
          className={cn(
            ROUND_BUTTON,
            "select-none",
            active ? "bg-accent text-ink-inverse scale-95" : "bg-page text-ink-1"
          )}
          {...bind}
        >
          <Mic size={18} aria-hidden="true" />
        </button>
      )}
    />
  );

  return (
    <div
      className="bg-page shrink-0 px-3 pt-2"
      style={{ paddingBottom: "calc(var(--mobile-screen-safe-bottom) + 10px)" }}
    >
      {(mentions.length > 0 || images.length > 0) && (
        <div className="mb-2 flex flex-col gap-1.5">
          {mentions.map((mention, index) => (
            <MentionQuote
              key={`${mention.contentId}:${index}`}
              mention={mention}
              onRemove={() => setMentions(mentions.filter((_, other) => other !== index))}
            />
          ))}
          {images.length > 0 && (
            <div className="flex gap-2">
              {images.map((image, index) => (
                <span key={index} className="relative h-14 w-14 shrink-0">
                  <img src={image} alt="" className="h-14 w-14 rounded-xl object-cover" />
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
        </div>
      )}
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
      <div className="bg-surface shadow-card flex items-end gap-1 rounded-[22px] py-1.5 pr-1.5 pl-1.5">
        <button
          type="button"
          aria-label="添加图片或引用"
          onClick={() => setPlusOpen(true)}
          className={cn(ROUND_BUTTON, "text-ink-2")}
        >
          <Plus size={20} aria-hidden="true" />
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={voicePreview || value}
          readOnly={!!voicePreview}
          placeholder={props.placeholder ?? "发消息，或按住麦克风说话"}
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
          className={cn(
            "text-tau-body placeholder:text-ink-3 field-sizing-content max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-[7px] leading-[1.45] outline-none",
            voicePreview ? "text-ink-3" : "text-ink-1"
          )}
        />
        <button
          type="button"
          aria-label="引用笔记"
          onClick={() => setPickerOpen(true)}
          className={cn(ROUND_BUTTON, "text-ink-2")}
        >
          <AtSign size={18} aria-hidden="true" />
        </button>
        {trailing}
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
      <ContentLinkPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={result => {
          const mention = mentionFromPicker(result);
          if (!mentions.some(item => !item.quote && item.contentId === mention.contentId))
            setMentions([...mentions, mention]);
          setPickerOpen(false);
          inputRef.current?.focus();
        }}
      />
    </div>
  );
}
