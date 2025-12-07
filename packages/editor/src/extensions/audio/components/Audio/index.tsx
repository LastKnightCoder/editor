import { IExtensionBaseProps } from "../../../../extensions/types";
import type { AudioElement } from "../../../../types";

import AddParagraph from "../../../../components/AddParagraph";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import classnames from "classnames";
import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";
import { message, Button, Input, Spin } from "antd";
import { If, ModernTabs } from "@tau/shared";
import React, { useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Editor, Transforms, Path } from "slate";
import { DeleteOutlined } from "@ant-design/icons";

import type { IResource } from "../../../types";
import { LinkOutlined, FolderOpenOutlined } from "@ant-design/icons";
import useTheme from "../../../../hooks/useTheme";
import { useUploadResource } from "../../../../hooks/useUploadResource";

const Audio = (props: IExtensionBaseProps<AudioElement>) => {
  const { attributes, element, children } = props;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();

  const ResourcePickerModal = editor.services?.components?.ResourcePickerModal;

  const appid = editor.services?.settings.get("textToSpeech.doubao.appid") ?? "";
  const token = editor.services?.settings.get("textToSpeech.doubao.token") ?? "";
  const currentSpeakerId = editor.services?.settings.get("textToSpeech.doubao.currentSpeakerId") ?? "";

  const uploadRef = useRef<HTMLInputElement>(null);
  const [networkUrl, setNetworkUrl] = useState("");
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);

  const [textToSpeechValue, setTextToSpeechValue] = useState("");
  const [textToSpeechTransformLoading, setTextToSpeechTransformLoading] =
    useState(false);
  const [textToSpeechAudio, setTextToSpeechAudio] = useState("");
  const textToSpeechDisabled = !appid || !token || !currentSpeakerId;

  const { src, uploading } = element;
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  const uploadFile = useUploadResource();
  const setUploading = (uploading: boolean) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        uploading,
      },
      {
        at: path,
      },
    );
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
    Transforms.setNodes(
      editor,
      {
        src: trimmed,
      },
      {
        at: path,
      },
    );
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
        if (!resourceSrc) {
          return;
        }
        referencePath = Path.next(referencePath);
        Transforms.insertNodes(
          editor,
          {
            type: "audio",
            src: resourceSrc,
            children: [
              {
                type: "formatted",
                text: "",
              },
            ],
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
    if (!appid || !token || !currentSpeakerId) {
      message.warning("请先配置文本转语音参数");
      return;
    }
    setTextToSpeechTransformLoading(true);
    try {
      const audioBlob = await editor.services?.ai.textToSpeech(textToSpeechValue);
      if (!audioBlob) {
        message.warning("文本转语音失败");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result?.toString().split(',')[1] || "";
        setTextToSpeechAudio(base64);
      };
      reader.readAsDataURL(audioBlob);
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
      {
        at: path,
      },
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
    Transforms.setNodes(
      editor,
      {
        src: uploadRes,
      },
      {
        at: path,
      },
    );
    setUploading(false);
    event.target.value = "";
  };

  const deleteAudio = () => {
    if (readOnly) {
      return;
    }
    const path = ReactEditor.findPath(editor, element);
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: path,
      });
      Transforms.insertNodes(
        editor,
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "" }],
        },
        {
          at: path,
          select: true,
        },
      );
    });
  };

  const renderNoContent = () => {
    if (readOnly) return null;
    return (
      <div
        className={classnames(styles.sourcePanel, {
          [styles.dark]: isDark,
        })}
      >
        <div className={styles.panelHeader}>
          <h4>插入音频</h4>
          <p>上传本地文件、引用网络链接，或直接从资源库中选择音频。</p>
        </div>
        <ModernTabs
          variant="flat"
          isDark={isDark}
          items={[
            {
              key: "local",
              label: "本地上传",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    支持 MP3、WAV 等常见格式，文件大小建议不超过 50 MB。
                  </p>
                  <div className={styles.actionsRow}>
                    <Button
                      className={styles.primaryButton}
                      icon={<FolderOpenOutlined />}
                      onClick={() => uploadRef.current?.click()}
                    >
                      选择文件
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "url",
              label: "网络地址",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    贴上可直接访问的音频链接，我们会自动加载。
                  </p>
                  <div className={styles.inputRow}>
                    <div className={styles.inputWrapper}>
                      <Input
                        prefix={<LinkOutlined className={styles.inputIcon} />}
                        placeholder="https://example.com/audio.mp3"
                        value={networkUrl}
                        onChange={handleNetworkUrlChange}
                        onPressEnter={handleOnNetworkUrlInputFinish}
                      />
                    </div>
                    <Button
                      type="primary"
                      className={styles.primaryButton}
                      onClick={handleOnNetworkUrlInputFinish}
                    >
                      插入
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "library",
              label: "资源库",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    直接引用资源库中的音频，多选会依次插入到编辑器。
                  </p>
                  <div className={styles.actionsRow}>
                    <Button
                      className={styles.secondaryButton}
                      onClick={() => setResourcePickerOpen(true)}
                    >
                      打开资源库
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "tts",
              label: "文本转语音",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    输入文本自动生成音频，需先在设置中配置语音服务。
                  </p>
                  <Input.TextArea
                    rows={4}
                    value={textToSpeechValue}
                    onChange={handleTextToSpeechContentChange}
                    placeholder="请输入要转换的内容"
                    className={styles.textArea}
                  />
                  <div className={styles.actionsRow}>
                    <Button
                      disabled={textToSpeechDisabled}
                      loading={textToSpeechTransformLoading}
                      className={styles.primaryButton}
                      onClick={handleOnTextToSpeechInputFinish}
                    >
                      {textToSpeechAudio ? "重新生成" : "生成音频"}
                    </Button>
                  </div>
                  <If condition={!!textToSpeechAudio}>
                    <div className={styles.previewCard}>
                      <audio
                        controls
                        src={`data:audio/mp3;base64,${textToSpeechAudio}`}
                      />
                      <Button
                        className={styles.secondaryButton}
                        onClick={applyGeneratedAudio}
                      >
                        应用到文档
                      </Button>
                    </div>
                  </If>
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
      ref={drop}
      className={styles.container}
      suppressContentEditableWarning
      contentEditable={"false"}
    >
      <div {...attributes}>
        <Spin spinning={uploading}>
          {src ? (
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
          ) : (
            <If condition={!src}>{renderNoContent()}</If>
          )}
        </Spin>
        {children}
        <div
          suppressContentEditableWarning
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        <input
          ref={uploadRef}
          type={"file"}
          accept={"audio/*"}
          hidden
          onChange={handleUploadFileChange}
        />
        <If condition={!readOnly}>
          <div className={styles.actions}>
            <div onClick={deleteAudio} className={styles.item}>
              <DeleteOutlined />
            </div>
          </div>
        </If>
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
