import React, { useContext, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlate } from "slate-react";
import { Transforms } from "slate";
import { Button, Empty, Flex, Input, Popover, Spin, App } from "antd";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

import { IExtensionBaseProps } from "@editor/extensions/types.ts";
import { VideoElement } from "@editor/types";
import AddParagraph from "@editor/components/AddParagraph";
import { EditorContext } from "@editor/index.tsx";
import useDragAndDrop from "@editor/hooks/useDragAndDrop.ts";

import LocalVideo from "@/components/LocalVideo";
import If from "@/components/If";

import styles from "./index.module.less";

const VideoComponent = (props: IExtensionBaseProps<VideoElement>) => {
  const { element, children, attributes } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { message } = App.useApp();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [networkUrlOpen, setNetworkUrlOpen] = useState(false);
  const [networkUrl, setNetworkUrl] = useState("");

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  const { uploadResource: uploadFile } = useContext(EditorContext) || {};

  const setUploading = useMemoizedFn((uploading) => {
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
  });

  const handleNetworkUrlChange = useMemoizedFn(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setNetworkUrl(event.target.value);
    },
  );
  const handleOnNetworkUrlInputFinish = useMemoizedFn(() => {
    if (!networkUrl) {
      message.warning("请输入视频地址");
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
  });

  const handleUploadFileChange = useMemoizedFn(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        message.warning("请选择文件");
        e.target.value = "";
        return;
      }
      setUploading(true);
      if (!uploadFile) {
        message.warning("尚未配置任何资源上传设置，无法上传资源");
        return null;
      }
      const path = ReactEditor.findPath(editor, element);
      const uploadRes = await uploadFile(file);
      if (!uploadRes) {
        setUploading(false);
        e.target.value = "";
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
      e.target.value = "";
    },
  );

  const { src, uploading, playbackRate = 1 } = element;

  const renderEmpty = () => {
    return (
      <Empty description={"暂未设置视频，请上传"}>
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
          </Flex>
        </Flex>
      </Empty>
    );
  };

  return (
    <div
      contentEditable={false}
      ref={drop}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div {...attributes}>
        <Spin spinning={uploading}>
          <If condition={!src}>{renderEmpty()}</If>
          <If condition={!!src}>
            <LocalVideo
              width={"100%"}
              controls
              src={src}
              playbackRate={playbackRate}
            />
          </If>
        </Spin>
        {children}
        <div
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
          accept={"video/*"}
          hidden
          onChange={handleUploadFileChange}
        />
        <AddParagraph element={element} />
      </div>
    </div>
  );
};

export default VideoComponent;
