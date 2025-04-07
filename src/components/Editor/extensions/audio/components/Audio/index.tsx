import { IExtensionBaseProps } from "@editor/extensions/types.ts";
import { AudioElement } from "@editor/types";
import LocalAudio from "@/components/LocalAudio";
import AddParagraph from "@editor/components/AddParagraph";
import useDragAndDrop from "@editor/hooks/useDragAndDrop.ts";
import classnames from "classnames";
import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";
import { message, Empty, Button, Flex, Popover, Input, Spin } from "antd";
import If from "@/components/If";
import React, { useContext, useRef, useState } from "react";
import { ReactEditor, useReadOnly, useSlate } from "slate-react";
import { Editor, Transforms } from "slate";
import { EditorContext } from "@editor/index.tsx";
import { textToSpeech } from "@/commands";
import useSettingStore from "@/stores/useSettingStore.ts";
import { DeleteOutlined } from "@ant-design/icons";

const Audio = (props: IExtensionBaseProps<AudioElement>) => {
  const { attributes, element, children } = props;
  const editor = useSlate();
  const readOnly = useReadOnly();

  // TODO 不应该写死模型，应该像 uploadFile 一样
  const { setting } = useSettingStore((state) => ({
    setting: state.setting.textToSpeech.doubao,
  }));

  const { appid, token, currentSpeakerId } = setting;

  const uploadRef = useRef<HTMLInputElement>(null);
  const [networkUrl, setNetworkUrl] = useState("");
  const [networkUrlOpen, setNetworkUrlOpen] = useState(false);

  const [textToSpeechValue, setTextToSpeechValue] = useState("");
  const [textToSpeechOpen, setTextToSpeechOpen] = useState(false);
  const [textToSpeechTransformLoading, setTextToSpeechTransformLoading] =
    useState(false);
  const [textToSpeechAudio, setTextToSpeechAudio] = useState("");
  const textToSpeechDisabled = !appid || !token || !currentSpeakerId;

  const { src, uploading } = element;
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  const { uploadResource: uploadFile } = useContext(EditorContext) || {};

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
    if (!networkUrl) {
      message.warning("请输入音频地址");
      return;
    }
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        src: networkUrl,
      },
      {
        at: path,
      },
    );
    setNetworkUrl("");
    setNetworkUrlOpen(false);
  };

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
      const audio = await textToSpeech(
        appid,
        token,
        textToSpeechValue,
        currentSpeakerId,
      );
      if (!audio) {
        message.warning("文本转语音失败");
        return;
      }
      setTextToSpeechAudio(audio);
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
      setTextToSpeechOpen(false);
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
    setTextToSpeechOpen(false);
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
    return (
      <Empty description={"暂未设置音频，请上传"}>
        <Flex vertical gap={12} justify={"center"}>
          <Flex align={"center"} gap={12} justify={"center"}>
            <Button
              disabled={readOnly}
              onClick={() => uploadRef.current?.click()}
            >
              本地上传
            </Button>
            <Popover
              open={!readOnly && networkUrlOpen}
              onOpenChange={setNetworkUrlOpen}
              trigger={"click"}
              arrow={false}
              placement={"bottom"}
              content={
                <Flex gap={12}>
                  <Input
                    size={"large"}
                    style={{ width: 500 }}
                    value={src}
                    onChange={handleNetworkUrlChange}
                  />
                  <Button onClick={handleOnNetworkUrlInputFinish}>确认</Button>
                </Flex>
              }
            >
              <Button disabled={readOnly}>网络地址</Button>
            </Popover>
            <Popover
              open={!readOnly && textToSpeechOpen}
              onOpenChange={setTextToSpeechOpen}
              trigger={"click"}
              arrow={false}
              placement={"bottom"}
              content={
                <Flex vertical gap={12} style={{ minWidth: 400 }}>
                  <Input.TextArea
                    rows={4}
                    value={textToSpeechValue}
                    onChange={handleTextToSpeechContentChange}
                  />
                  <div style={{ marginLeft: "auto" }}>
                    <Button
                      disabled={textToSpeechDisabled}
                      loading={textToSpeechTransformLoading}
                      onClick={handleOnTextToSpeechInputFinish}
                    >
                      {textToSpeechAudio ? "重新生成" : "生成"}
                    </Button>
                  </div>
                  <If condition={!!textToSpeechAudio}>
                    <Flex gap={12} align={"center"}>
                      <audio
                        controls
                        src={`data:audio/mp3;base64,${textToSpeechAudio}`}
                      />
                      <Button onClick={applyGeneratedAudio}>应用</Button>
                    </Flex>
                  </If>
                </Flex>
              }
            >
              <Button disabled={readOnly}>文本转语音</Button>
            </Popover>
          </Flex>
        </Flex>
      </Empty>
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
          <If condition={!!src}>
            <LocalAudio
              controls
              src={src}
              className={classnames(styles.audio, {
                [styles.dragging]: isDragging,
                [styles.drop]: isOverCurrent && canDrop,
                [styles.before]: isBefore,
                [styles.after]: !isBefore,
              })}
            />
          </If>
          <If condition={!src}>{renderNoContent()}</If>
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
    </div>
  );
};

export default Audio;
