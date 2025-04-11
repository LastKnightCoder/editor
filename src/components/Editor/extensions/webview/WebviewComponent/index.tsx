import { useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlate } from "slate-react";
import { Transforms } from "slate";
import { Modal, App, Dropdown } from "antd";
import { MoreOutlined } from "@ant-design/icons";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

import { IExtensionBaseProps } from "@/components/Editor/extensions/types";
import { WebviewElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop";
import Webview, { WebviewRef } from "@/components/Webview";
import ResizeHandle from "@/components/ResizeHandle";
import InputUrlModal from "../InputUrlModal";

import styles from "./index.module.less";

const WebviewComponent = (props: IExtensionBaseProps<WebviewElement>) => {
  const { element, children, attributes } = props;
  const { url, height = 400 } = element;

  const webviewRef = useRef<WebviewRef>(null);
  const { modal } = App.useApp();
  const editor = useSlate();
  const readOnly = useReadOnly();
  const [editUrlOpen, setEditUrlOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  const handleHeightChange = useMemoizedFn((newHeight: number) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        height: newHeight,
      },
      {
        at: path,
      },
    );
  });

  const handleEditUrl = useMemoizedFn(() => {
    setEditUrlOpen(true);
  });

  const handleEditUrlConfirm = useMemoizedFn((newUrl: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        url: newUrl,
      },
      {
        at: path,
      },
    );
    setEditUrlOpen(false);
  });

  const handleDelete = useMemoizedFn(() => {
    modal.confirm({
      title: "确认删除",
      content: "确定要删除这个网页视图吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: () => {
        const path = ReactEditor.findPath(editor, element);
        Transforms.removeNodes(editor, { at: path });
      },
    });
  });

  const handleRefresh = useMemoizedFn(() => {
    webviewRef.current?.reload();
  });

  return (
    <div
      ref={drop}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div {...attributes}>
        <div className={styles.webviewWrapper}>
          {!readOnly && (
            <Dropdown
              menu={{
                items: [
                  {
                    key: "editUrl",
                    label: "编辑",
                    onClick: handleEditUrl,
                  },
                  {
                    key: "delete",
                    label: "删除",
                    onClick: handleDelete,
                  },
                  {
                    key: "refresh",
                    label: "刷新",
                    onClick: handleRefresh,
                  },
                ],
              }}
            >
              <div className={styles.settings}>
                <MoreOutlined />
              </div>
            </Dropdown>
          )}
          {url && (
            <Webview
              ref={webviewRef}
              src={url}
              style={{
                width: "100%",
                height,
                pointerEvents: isResizing ? "none" : "auto",
              }}
              allowPopups={false}
            />
          )}
          <ResizeHandle
            initialHeight={height}
            minHeight={200}
            maxHeight={800}
            onHeightChange={handleHeightChange}
            onResizeStart={() => {
              setIsResizing(true);
            }}
            onResizeEnd={() => {
              setIsResizing(false);
            }}
          />
        </div>

        {children}

        <AddParagraph element={element} />
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>

        <Modal
          title="编辑网页地址"
          open={editUrlOpen}
          footer={null}
          onCancel={() => setEditUrlOpen(false)}
        >
          <InputUrlModal
            defaultValue={url}
            onOk={handleEditUrlConfirm}
            onCancel={() => setEditUrlOpen(false)}
          />
        </Modal>
      </div>
    </div>
  );
};

export default WebviewComponent;
