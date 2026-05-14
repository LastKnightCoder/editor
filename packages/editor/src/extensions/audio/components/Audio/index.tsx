import { IExtensionBaseProps } from "../../../../extensions/types";
import type { AudioElement } from "../../../../types";

import AddParagraph from "../../../../components/AddParagraph";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import classnames from "classnames";
import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";
import { message, Spin } from "antd";
import { If, ModernTabs } from "@tau/shared";
import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms, Path } from "slate";
import { buildAudioMenuItems } from "../../utils/menuItems";

import type { IResource } from "../../../types";
import { LinkOutlined, FolderOpenOutlined } from "@ant-design/icons";
import useTheme from "../../../../hooks/useTheme";
import { useUploadResource } from "../../../../hooks/useUploadResource";

interface VoiceOption {
  id: string;
  name: string;
  description?: string;
}

const Audio = (props: IExtensionBaseProps<AudioElement>) => {
  const { attributes, element, children } = props;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();

  const ResourcePickerModal = editor.services?.components?.ResourcePickerModal;
  const Audio = editor.services?.components?.Audio;

  // TTS state
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [voiceQuery, setVoiceQuery] = useState("");
  const voiceTriggerRef = useRef<HTMLDivElement>(null);
  const voiceDropdownRef = useRef<HTMLDivElement>(null);
  const [voiceDropdownPos, setVoiceDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const uploadRef = useRef<HTMLInputElement>(null);
  const [networkUrl, setNetworkUrl] = useState("");
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);

  const [textToSpeechValue, setTextToSpeechValue] = useState("");
  const [textToSpeechTransformLoading, setTextToSpeechTransformLoading] =
    useState(false);
  const [textToSpeechAudio, setTextToSpeechAudio] = useState("");

  const isTTSConfigured = editor.services?.ai?.isTTSConfigured?.() ?? false;
  const textToSpeechDisabled = !isTTSConfigured || !selectedVoiceId;

  // Load voice list
  const loadVoices = useCallback(async () => {
    if (!editor.services?.ai?.getVoiceList) return;
    setVoicesLoading(true);
    try {
      const voiceList = await editor.services.ai.getVoiceList();
      setVoices(voiceList);
      if (voiceList.length > 0 && !selectedVoiceId) {
        setSelectedVoiceId(voiceList[0].id);
      }
    } catch (error) {
      console.error("Failed to load voices:", error);
    } finally {
      setVoicesLoading(false);
    }
  }, [editor.services?.ai, selectedVoiceId]);

  useEffect(() => {
    if (isTTSConfigured && voices.length === 0) {
      loadVoices();
    }
  }, [isTTSConfigured, voices.length, loadVoices]);

  const filteredVoices = useMemo(() => {
    if (!voiceQuery.trim()) return voices;
    const q = voiceQuery.toLowerCase();
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q),
    );
  }, [voices, voiceQuery]);

  useEffect(() => {
    if (!voiceDropdownOpen) return;
    const calcPos = () => {
      if (!voiceTriggerRef.current) return;
      const rect = voiceTriggerRef.current.getBoundingClientRect();
      setVoiceDropdownPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };
    calcPos();
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        voiceTriggerRef.current?.contains(target) ||
        voiceDropdownRef.current?.contains(target)
      )
        return;
      setVoiceDropdownOpen(false);
      setVoiceQuery("");
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [voiceDropdownOpen]);

  const { src, uploading } = element;
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });
  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: (params) => buildAudioMenuItems(params),
  });

  const uploadFile = useUploadResource();
  const setUploading = (uploading: boolean) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { uploading }, { at: path });
  };

  const handleNetworkUrlChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setNetworkUrl(event.target.value);
  };

  const handleOnNetworkUrlInputFinish = () => {
    const trimmed = networkUrl.trim();
    if (!trimmed) {
      message.warning("请输入音频地址");
      return;
    }
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { src: trimmed }, { at: path });
    setNetworkUrl("");
  };

  const resolveResourcePath = (resource: IResource) => {
    return resource.path || resource.url || "";
  };

  const handleInsertFromResource = useMemoizedFn(
    async (selected: IResource[]) => {
      if (!selected.length) {
        setResourcePickerOpen(false);
        return;
      }
      const [first, ...rest] = selected;
      const firstSrc = resolveResourcePath(first);
      if (!firstSrc) {
        message.warning("资源没有可用的路径");
        setResourcePickerOpen(false);
        return;
      }

      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          src: firstSrc,
          uploading: false,
          isFromGenerate: false,
          audioText: undefined,
        },
        { at: path },
      );

      let referencePath = path;
      rest.forEach((resource) => {
        const resourceSrc = resolveResourcePath(resource);
        if (!resourceSrc) return;
        referencePath = Path.next(referencePath);
        Transforms.insertNodes(
          editor,
          {
            type: "audio",
            src: resourceSrc,
            children: [{ type: "formatted", text: "" }],
          },
          { at: referencePath },
        );
      });

      setResourcePickerOpen(false);
    },
  );

  const handleTextToSpeechContentChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setTextToSpeechValue(event.target.value);
  };

  const handleOnTextToSpeechInputFinish = async () => {
    if (!isTTSConfigured) {
      message.warning("请先配置语音合成服务");
      return;
    }
    if (!selectedVoiceId) {
      message.warning("请选择一个音色");
      return;
    }
    if (!textToSpeechValue.trim()) {
      message.warning("请输入要转换的文本");
      return;
    }
    setTextToSpeechTransformLoading(true);
    try {
      const audioBlob = await editor.services?.ai.textToSpeech(
        textToSpeechValue,
        selectedVoiceId,
      );
      if (!audioBlob) {
        message.warning("文本转语音失败");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result?.toString().split(",")[1] || "";
        setTextToSpeechAudio(base64);
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error("TTS error:", error);
      message.error("文本转语音失败");
    } finally {
      setTextToSpeechTransformLoading(false);
    }
  };

  const applyGeneratedAudio = async () => {
    if (!uploadFile) {
      message.warning("尚未配置任何资源上传设置，无法上传资源");
      return;
    }
    if (!textToSpeechAudio) {
      message.warning("请先输入要转换的文本");
      setTextToSpeechAudio("");
      setTextToSpeechTransformLoading(false);
      return;
    }

    const binaryData = atob(textToSpeechAudio);
    const byteArray = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      byteArray[i] = binaryData.charCodeAt(i);
    }
    const file = new File([byteArray], `${Date.now()}.mp3`, {
      type: "audio/mp3",
    });
    const url = await uploadFile(file);
    if (!url) {
      message.error("上传音频失败");
      return;
    }
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        src: url,
        isFromGenerate: true,
        audioText: textToSpeechValue,
        uploading: false,
      },
      { at: path },
    );
    setTextToSpeechValue("");
    setTextToSpeechAudio("");
    setTextToSpeechTransformLoading(false);
  };

  const handleUploadFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) {
      message.warning("尚未选择文件");
      event.target.value = "";
      return;
    }
    if (!uploadFile) {
      message.warning("尚未配置任何资源上传设置，无法上传资源");
      return null;
    }
    setUploading(true);
    const path = ReactEditor.findPath(editor, element);
    const file = files[0];
    const uploadRes = await uploadFile(file);
    if (!uploadRes) {
      setUploading(false);
      event.target.value = "";
      return;
    }
    Transforms.setNodes(editor, { src: uploadRes }, { at: path });
    setUploading(false);
    event.target.value = "";
  };

  const renderNoContent = () => {
    if (readOnly) return null;
    return (
      <div className="rounded-[0.75em] p-[1.25em] border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <ModernTabs
          variant="flat"
          isDark={isDark}
          items={[
            {
              key: "local",
              label: "本地上传",
              children: (
                <div className="flex flex-col gap-[1em]">
                  <p className="m-0 text-[0.8125em] text-gray-500 dark:text-zinc-400">
                    支持 MP3、WAV 等常见格式，文件大小建议不超过 50 MB。
                  </p>
                  <div className="flex justify-start">
                    <button
                      type="button"
                      className="px-[1.25em] py-[0.625em] rounded-[0.75em] border-none text-[0.875em] font-semibold cursor-pointer transition-all bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)] flex items-center gap-[0.5em]"
                      onClick={() => uploadRef.current?.click()}
                    >
                      <FolderOpenOutlined />
                      选择文件
                    </button>
                  </div>
                </div>
              ),
            },
            {
              key: "url",
              label: "网络地址",
              children: (
                <div className="flex flex-col gap-[1em]">
                  <p className="m-0 text-[0.8125em] text-gray-500 dark:text-zinc-400">
                    贴上可直接访问的音频链接，我们会自动加载。
                  </p>
                  <div className="flex gap-[0.75em] flex-wrap items-center">
                    <div className="flex-1 relative">
                      <span className="absolute left-[0.75em] top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none">
                        <LinkOutlined />
                      </span>
                      <input
                        type="text"
                        className="w-full px-[1em] py-[0.875em] pl-[2.25em] rounded-[0.75em] border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-800 dark:text-white text-[0.875em] outline-none transition-all duration-200 shadow-inner placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:border-[var(--th-border-focus)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_var(--th-border-focus)/20] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_var(--th-border-focus)/25]"
                        placeholder="https://example.com/audio.mp3"
                        value={networkUrl}
                        onChange={handleNetworkUrlChange}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleOnNetworkUrlInputFinish();
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="px-[1.25em] py-[0.75em] rounded-[0.75em] border-none text-[0.875em] font-semibold bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] cursor-pointer transition-all duration-200 hover:bg-[var(--th-btn-hover)]"
                      onClick={handleOnNetworkUrlInputFinish}
                    >
                      插入
                    </button>
                  </div>
                </div>
              ),
            },
            {
              key: "library",
              label: "资源库",
              children: (
                <div className="flex flex-col gap-[1em]">
                  <p className="m-0 text-[0.8125em] text-gray-500 dark:text-zinc-400">
                    直接引用资源库中的音频，多选会依次插入到编辑器。
                  </p>
                  <div className="flex justify-start">
                    <button
                      type="button"
                      className="px-[1.25em] py-[0.625em] rounded-[0.75em] text-[0.875em] font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-200 dark:hover:bg-zinc-700"
                      onClick={() => setResourcePickerOpen(true)}
                    >
                      打开资源库
                    </button>
                  </div>
                </div>
              ),
            },
            {
              key: "tts",
              label: "文本转语音",
              children: (
                <div className="flex flex-col gap-[1em]">
                  <p className="m-0 text-[0.8125em] text-gray-500 dark:text-zinc-400">
                    输入文本自动生成音频，需先在设置中配置语音服务。
                  </p>
                  {!isTTSConfigured ? (
                    <p className="m-0 text-[0.8125em] text-yellow-600 dark:text-yellow-400">
                      请先在设置中配置语音合成服务
                    </p>
                  ) : (
                    <>
                      <div className="relative">
                        <div className="flex items-center gap-[0.5em]">
                          <span className="text-[0.8125em] text-gray-600 dark:text-zinc-300 whitespace-nowrap">
                            音色：
                          </span>
                          <div
                            ref={voiceTriggerRef}
                            className="flex-1 min-w-[9em] h-[2.25em] px-[0.75em] rounded-[0.75em] bg-white dark:bg-zinc-900 text-[0.8125em] text-gray-800 dark:text-zinc-100 flex items-center justify-between cursor-pointer transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-zinc-800 shadow-[0_0_0_1px_rgba(34,42,53,0.1),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                            onClick={() => {
                              if (!voicesLoading)
                                setVoiceDropdownOpen((v) => !v);
                            }}
                          >
                            <span className="truncate flex-1 min-w-0">
                              {voices.find((v) => v.id === selectedVoiceId)
                                ?.name || (
                                <span className="text-gray-400 dark:text-zinc-500">
                                  选择音色
                                </span>
                              )}
                            </span>
                            <svg
                              className={classnames(
                                "w-[1em] h-[1em] shrink-0 ml-[0.5em] transition-transform text-gray-400 dark:text-zinc-500",
                                voiceDropdownOpen && "rotate-180",
                              )}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </div>
                        </div>
                        {voiceDropdownOpen &&
                          createPortal(
                            <div
                              ref={voiceDropdownRef}
                              className="fixed z-[9999] p-[0.375em] rounded-[0.75em] bg-white dark:bg-zinc-900 shadow-[0_0_0_1px_rgba(34,42,53,0.08),0_1px_5px_-4px_rgba(19,19,22,0.7),0_4px_8px_rgba(34,42,53,0.05)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.4)]"
                              style={{
                                top: voiceDropdownPos.top,
                                left: voiceDropdownPos.left,
                                width: voiceDropdownPos.width,
                              }}
                            >
                              <input
                                value={voiceQuery}
                                onChange={(e) => setVoiceQuery(e.target.value)}
                                placeholder="搜索音色..."
                                className="w-full h-[2em] px-[0.75em] mb-[0.375em] rounded-[0.5em] border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-[0.8125em] text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="max-h-[15em] overflow-y-auto overflow-x-hidden">
                                {filteredVoices.length === 0 && (
                                  <div className="px-[0.75em] py-[0.5em] text-[0.8125em] text-gray-500 dark:text-zinc-400">
                                    无匹配项
                                  </div>
                                )}
                                {filteredVoices.map((v) => (
                                  <div
                                    key={v.id}
                                    className={classnames(
                                      "px-[0.75em] py-[0.375em] mx-[0.125em] mb-[0.125em] rounded-[0.5em] text-[0.8125em] cursor-pointer transition-colors duration-100",
                                      v.id === selectedVoiceId
                                        ? "bg-gray-900/[0.06] text-gray-900 dark:bg-white/[0.08] dark:text-white font-medium"
                                        : "hover:bg-gray-100 dark:hover:bg-zinc-700/50 text-gray-700 dark:text-zinc-200",
                                    )}
                                    onClick={() => {
                                      setSelectedVoiceId(v.id);
                                      setVoiceDropdownOpen(false);
                                      setVoiceQuery("");
                                    }}
                                  >
                                    <div>{v.name}</div>
                                    {v.description && (
                                      <div className="text-[0.85em] text-gray-400 dark:text-zinc-500 mt-[0.125em]">
                                        {v.description}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>,
                            document.body,
                          )}
                      </div>
                      <textarea
                        className="w-full min-h-[7.5em] resize-y px-[1em] py-[0.875em] rounded-[0.75em] border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-800 dark:text-white text-[0.875em] leading-[1.6] outline-none transition-all duration-200 shadow-inner placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:border-[var(--th-border-focus)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_var(--th-border-focus)/20] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_var(--th-border-focus)/25]"
                        rows={4}
                        value={textToSpeechValue}
                        onChange={handleTextToSpeechContentChange}
                        placeholder="请输入要转换的内容"
                      />
                      <div className="flex justify-start">
                        <button
                          type="button"
                          className="px-[1.25em] py-[0.625em] rounded-[0.75em] border-none text-[0.875em] font-semibold cursor-pointer transition-all bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                          disabled={
                            textToSpeechDisabled || textToSpeechTransformLoading
                          }
                          onClick={handleOnTextToSpeechInputFinish}
                        >
                          {textToSpeechTransformLoading
                            ? "生成中..."
                            : textToSpeechAudio
                              ? "重新生成"
                              : "生成音频"}
                        </button>
                      </div>
                      {textToSpeechAudio && (
                        <div className="flex items-center justify-between gap-[1em] p-[1em] rounded-[0.75em] border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950">
                          <audio
                            controls
                            src={`data:audio/mp3;base64,${textToSpeechAudio}`}
                            className="flex-1"
                          />
                          <button
                            type="button"
                            className="px-[1.25em] py-[0.625em] rounded-[0.75em] text-[0.875em] font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-200 dark:hover:bg-zinc-700 shrink-0"
                            onClick={applyGeneratedAudio}
                          >
                            应用到文档
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    );
  };

  return (
    <div
      ref={(node) => {
        drop(node);
      }}
      className={styles.container}
      suppressContentEditableWarning
      contentEditable={"false"}
    >
      <div {...attributes}>
        <Spin spinning={uploading}>
          {src ? (
            Audio ? (
              <Audio
                src={src}
                controls
                className={classnames(styles.audio, {
                  [styles.dragging]: isDragging,
                  [styles.drop]: isOverCurrent && canDrop,
                  [styles.before]: isBefore,
                  [styles.after]: !isBefore,
                })}
              />
            ) : (
              <audio
                src={src}
                controls
                className={classnames(styles.audio, {
                  [styles.dragging]: isDragging,
                  [styles.drop]: isOverCurrent && canDrop,
                  [styles.before]: isBefore,
                  [styles.after]: !isBefore,
                })}
              />
            )
          ) : (
            <If condition={!src}>{renderNoContent()}</If>
          )}
        </Spin>
        {children}
        <div
          suppressContentEditableWarning
          contentEditable={false}
          ref={(node) => {
            drag(node);
          }}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
          onClick={dragHandlerProps.onClick}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        <EditorContextMenu {...menuProps} readonly={readOnly} />
        <input
          ref={uploadRef}
          type={"file"}
          accept={"audio/*"}
          hidden
          onChange={handleUploadFileChange}
        />
        <AddParagraph element={element} />
      </div>
      {ResourcePickerModal && (
        <ResourcePickerModal
          open={resourcePickerOpen}
          onCancel={() => setResourcePickerOpen(false)}
          allowedTypes={["audio"]}
          multiple
          title="选择音频"
          onConfirm={handleInsertFromResource}
        />
      )}
    </div>
  );
};

export default Audio;
