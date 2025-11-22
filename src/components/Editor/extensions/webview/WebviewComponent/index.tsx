import { useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { Modal, App, Dropdown } from "antd";
import { MoreOutlined } from "@ant-design/icons";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

import { IExtensionBaseProps } from "@/components/Editor/extensions/types";
import { WebviewElement } from "@/components/Editor/types";
import { WebLinkSourceType } from "@/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop";
import Webview, { WebviewRef } from "@/components/Webview";
import ResizeHandle from "@/components/ResizeHandle";
import InputUrlModal from "../InputUrlModal";

import styles from "./index.module.less";
import useIsLastElement from "@/components/Editor/hooks/useIsLastElement.ts";
import useUploadResource from "@/components/Editor/hooks/useUploadResource";
import { selectFile, getFileBaseName, readTextFile } from "@/commands";
import { normalizeWebviewUrl } from "@/utils";

const WebviewComponent = (props: IExtensionBaseProps<WebviewElement>) => {
  const { element, children, attributes } = props;
  const { url, height = 400 } = element;
  const isLast = useIsLastElement(element);
  const webviewRef = useRef<WebviewRef>(null);
  const { modal, message } = App.useApp();
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [editUrlOpen, setEditUrlOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [localUploadLoading, setLocalUploadLoading] = useState(false);
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });
  const uploadResource = useUploadResource();

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

  const handleEditUrlConfirm = useMemoizedFn(
    ({
      url: nextUrl,
      sourceType,
    }: {
      url: string;
      sourceType: WebLinkSourceType;
    }) => {
      const normalizedUrl =
        sourceType === "remote" ? normalizeWebviewUrl(nextUrl) : nextUrl;
      if (!normalizedUrl) {
        setEditUrlOpen(false);
        return;
      }
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          url: normalizedUrl,
          sourceType,
        },
        {
          at: path,
        },
      );
      setEditUrlOpen(false);
    },
  );

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

  const handleSelectLocalHtml = useMemoizedFn(async () => {
    if (!uploadResource) {
      message.error("当前编辑器未配置上传能力");
      return;
    }
    const filePaths = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "HTML",
          extensions: ["html", "htm"],
        },
      ],
    });
    if (!filePaths || filePaths.length === 0) return;
    const filePath = filePaths[0];
    try {
      setLocalUploadLoading(true);
      message.loading({
        key: "webview-component-upload",
        content: "正在上传 HTML 文件...",
        duration: 0,
      });
      const fileName = await getFileBaseName(filePath);
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent], fileName, {
        type: "text/html",
      });
      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        message.error({
          key: "webview-component-upload",
          content: "上传 HTML 文件失败",
        });
        return;
      }
      const normalizedUrl = normalizeWebviewUrl(uploadedUrl);
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          url: normalizedUrl,
          sourceType: "local",
        },
        {
          at: path,
        },
      );
      message.success({
        key: "webview-component-upload",
        content: "HTML 文件已插入",
      });
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      message.error({
        key: "webview-component-upload",
        content: "选择 HTML 文件失败",
      });
    } finally {
      setLocalUploadLoading(false);
    }
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
                    key: "selectLocalHtml",
                    label: localUploadLoading ? "上传中..." : "选择本地 HTML",
                    onClick: handleSelectLocalHtml,
                    disabled: localUploadLoading,
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
              sourceType={element.sourceType}
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

        {!(readOnly && isLast) && <AddParagraph element={element} />}
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
            defaultSourceType={element.sourceType ?? "remote"}
            onOk={handleEditUrlConfirm}
            onCancel={() => setEditUrlOpen(false)}
          />
        </Modal>
      </div>
    </div>
  );
};

export default WebviewComponent;
