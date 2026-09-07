import { useState, useEffect, useMemo, lazy, Suspense, memo } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { App, Dropdown, Spin } from "antd";
import { MoreOutlined, LoadingOutlined } from "@ant-design/icons";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

import { IExtensionBaseProps } from "@tau/editor/src";
import { AddParagraph } from "@tau/editor/src";
import { useDragAndDrop } from "@tau/editor/src";
import type { ChatReferenceElement } from "../../types";
import ResizeHandle from "@/components/ResizeHandle";
import useTheme from "@/hooks/useTheme";
import { getChatMessageById } from "@/commands/chat-message";
import { ChatMessage } from "@/types";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { MermaidRenderer, LazySyntaxHighlighter } from "@tau/shared";
import { openExternal } from "@/commands";
import ChatSelectorModal from "../ChatSelectorModal";
import { PlantUML } from "@tau/shared";

import styles from "./index.module.less";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer")
);

const ChatReferenceCard = memo((props: IExtensionBaseProps<ChatReferenceElement>) => {
  const { element, children, attributes } = props;
  const { chatId, title, height = 400 } = element;

  const { modal } = App.useApp();
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();
  const [isResizing, setIsResizing] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [chatData, setChatData] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(true);

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } = useDragAndDrop({
    element,
  });

  useEffect(() => {
    const fetchChat = async () => {
      try {
        setLoading(true);
        const chat = await getChatMessageById(chatId);
        setChatData(chat);
      } catch (error) {
        console.error("Failed to load chat:", error);
        setChatData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchChat();
  }, [chatId]);

  const handleHeightChange = useMemoizedFn((newHeight: number) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        height: newHeight,
      },
      {
        at: path,
      }
    );
  });

  const handleEdit = useMemoizedFn(() => {
    setEditModalOpen(true);
  });

  const handleEditConfirm = useMemoizedFn((newChatId: number, newTitle: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        chatId: newChatId,
        title: newTitle,
      },
      {
        at: path,
      }
    );
    setEditModalOpen(false);
  });

  const handleDelete = useMemoizedFn(() => {
    modal.confirm({
      title: "确认删除",
      content: "确定要删除这个对话引用吗？",
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

  const handleLinkClick = useMemoizedFn(
    (event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
      if (href) {
        event.preventDefault();
        openExternal(href).catch(err => {
          console.error("打开链接失败:", err);
        });
      }
    }
  );

  const markdownComponents = useMemo(() => {
    return {
      code(props: { children?: React.ReactNode; className?: string }) {
        const { children, className, ...rest } = props;
        const match = /language-(\w+)/.exec(className || "");
        const mermaidMatch = match && match[1] === "mermaid";
        const plantumlMatch = match && match[1] === "plantuml";

        if (mermaidMatch) {
          return <MermaidRenderer code={String(children).replace(/\n$/, "")} isDark={isDark} />;
        }

        if (plantumlMatch) {
          return <PlantUML content={String(children).replace(/\n$/, "")} isDark={isDark} />;
        }

        if (match) {
          return (
            <LazySyntaxHighlighter language={match[1]} isDark={isDark} {...rest}>
              {String(children).replace(/\n$/, "")}
            </LazySyntaxHighlighter>
          );
        }

        return (
          <code {...rest} className={className}>
            {children}
          </code>
        );
      },
      a: ({ children, href, ...props }: { children?: React.ReactNode; href?: string }) => {
        return (
          <a
            {...props}
            href={href}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => handleLinkClick(e, href)}
          >
            {children}
          </a>
        );
      },
    };
  }, [handleLinkClick, isDark]);

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
      contentEditable={false}
    >
      <div {...attributes}>
        <div className={styles.card}>
          {!readOnly && (
            <Dropdown
              menu={{
                items: [
                  {
                    key: "edit",
                    label: "编辑",
                    onClick: handleEdit,
                  },
                  {
                    key: "delete",
                    label: "删除",
                    onClick: handleDelete,
                  },
                ],
              }}
            >
              <div className={styles.moreButton}>
                <MoreOutlined />
              </div>
            </Dropdown>
          )}

          <div className={styles.header}>
            <h3 className={styles.title}>{title}</h3>
          </div>

          <div
            style={{
              height,
              pointerEvents: isResizing ? "none" : "auto",
            }}
            className={styles.content}
          >
            {loading ? (
              <div className={styles.loadingContainer}>
                <Spin indicator={<LoadingOutlined />} />
              </div>
            ) : chatData ? (
              <MarkdownProvider isDark={isDark} isVisible={true}>
                <div className="flex h-full flex-col">
                  <Suspense
                    fallback={
                      <div className={styles.loadingContainer}>
                        <Spin indicator={<LoadingOutlined />} />
                      </div>
                    }
                  >
                    <ChatContainer
                      currentChat={chatData}
                      isDark={isDark}
                      markdownComponents={markdownComponents}
                      isVisible={true}
                      updateChatMessage={() => Promise.resolve(chatData)}
                      updateCurrentChat={() => {
                        // do nothing
                        return;
                      }}
                      sendLoading={false}
                      setSendLoading={() => {
                        // do nothing
                        return;
                      }}
                      titleRef={{ current: null }}
                      onCreateNewMessage={() => Promise.resolve()}
                      createMessageLoading={false}
                      hideInput={true}
                      onCreateChat={async () => chatData}
                      onCreateBranch={async () => chatData}
                    />
                  </Suspense>
                </div>
              </MarkdownProvider>
            ) : (
              <div className={styles.emptyContainer}>对话不存在或已被删除</div>
            )}
          </div>

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
        {!readOnly && (
          <div
            contentEditable={false}
            ref={node => {
              drag(node);
            }}
            className={classnames(styles.dragHandler, {
              [styles.grabbing]: isDragging,
              [styles.canDrag]: canDrag,
            })}
          >
            <MdDragIndicator className={styles.icon} />
          </div>
        )}

        <ChatSelectorModal
          open={editModalOpen}
          onCancel={() => setEditModalOpen(false)}
          onSelect={handleEditConfirm}
        />
      </div>
    </div>
  );
});

ChatReferenceCard.displayName = "ChatReferenceCard";

export default ChatReferenceCard;
