import { useEffect, useRef } from "react";
import { useMemoizedFn, useCreation, useRafInterval, useUnmount } from "ahooks";
import { Button, Modal, Tooltip, App } from "antd";
import { Descendant } from "slate";
import { ExpandOutlined, CloseOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditCard from "@/pages/CardDetailView/useEditCard";
import useUploadResource from "@/hooks/useUploadResource";
import useEditContent from "@/hooks/useEditContent";

import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { formatDate, defaultCardEventBus } from "@/utils";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

interface CardPreviewProps {
  cardId: number | undefined;
  visible: boolean;
  onClose: () => void;
  onGoToDetail?: () => void;
}

const CardPreview = (props: CardPreviewProps) => {
  const { cardId, visible, onClose, onGoToDetail } = props;
  const navigate = useNavigate();
  const editorRef = useRef<EditorRef>(null);
  const { message } = App.useApp();
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );

  const {
    initValue,
    loading,
    editingCard,
    onContentChange: onContentChangeFromEditCard,
    onAddTag,
    onDeleteTag,
    onTagChange,
    saveCard,
    prevCard,
    setEditingCard,
    onInit,
  } = useEditCard(cardId);

  const uploadResource = useUploadResource();
  const { throttleHandleEditorContentChange } = useEditContent(
    editingCard?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  useEffect(() => {
    if (visible && editingCard) {
      const unsubscribe = cardEventBus.subscribeToCardWithId(
        "card:updated",
        editingCard.id,
        (data) => {
          setEditingCard(data.card);
          prevCard.current = data.card;
        },
      );
      return () => {
        unsubscribe();
      };
    }
  }, [cardId, visible, cardEventBus, editingCard]);

  useRafInterval(async () => {
    if (editingCard) {
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  }, 500);

  useUnmount(async () => {
    const updatedCard = await saveCard();
    if (updatedCard) {
      cardEventBus.publishCardEvent("card:updated", updatedCard);
    }
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
    onContentChangeFromEditCard(content);
  });

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    onAddTag(tag);
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    onDeleteTag(tag);
  });

  const handleEditTag = useMemoizedFn((oldTag: string, newTag: string) => {
    if (!editingCard || !newTag || newTag === oldTag) return;
    if (editingCard.tags.includes(newTag)) {
      message.warning("标签已存在");
      return;
    }
    // 直接替换标签，保持顺序
    const newTags = editingCard.tags.map((tag) =>
      tag === oldTag ? newTag : tag,
    );
    onTagChange(newTags);
  });

  const handleClose = useMemoizedFn(() => {
    onClose();
  });

  const handleGoToDetail = useMemoizedFn(() => {
    if (editingCard) {
      navigate(`/cards/detail/${editingCard.id}`);
      onGoToDetail?.();
    }
  });

  const renderHeader = () => (
    <div className="w-full flex justify-between items-center">
      <div className="flex text-xs gap-2.5 text-gray-500">
        {editingCard && (
          <>
            <div>
              <span>创建于 {formatDate(editingCard.create_time, true)}</span>
            </div>
            <div>
              <span>
                最后修改于 {formatDate(editingCard.update_time, true)}
              </span>
            </div>
            <div>字数：{editingCard.count}</div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Tooltip title="前往详情">
          <Button
            type="text"
            icon={<ExpandOutlined />}
            onClick={handleGoToDetail}
          />
        </Tooltip>
        <Tooltip title="关闭">
          <Button type="text" icon={<CloseOutlined />} onClick={handleClose} />
        </Tooltip>
      </div>
    </div>
  );

  return (
    <Modal
      title={renderHeader()}
      open={visible && !!cardId}
      onCancel={handleClose}
      footer={null}
      closable={false}
      width={800}
      styles={{
        header: {
          marginBottom: 0,
          padding: "0 12px 12px 24px",
          borderBottom: "1px solid var(--border-color)",
        },
        content: {
          overflow: "hidden",
        },
        body: {
          padding: "0 24px 24px",
          maxHeight: "70vh",
          overflow: "auto",
        },
      }}
      destroyOnClose
      keyboard={false}
    >
      {loading ? (
        <div className="flex justify-center items-center h-75 text-[length:var(--font-size)]">
          加载中...
        </div>
      ) : (
        editingCard && (
          <div className="flex flex-col gap-3">
            <div className="min-h-50 text-[length:var(--font-size)]">
              <ErrorBoundary>
                <Editor
                  key={editingCard.id}
                  ref={editorRef}
                  onInit={onInit}
                  initValue={initValue}
                  onChange={onContentChange}
                  extensions={customExtensions}
                  uploadResource={uploadResource}
                  readonly={false}
                />
              </ErrorBoundary>
            </div>
            <div className="flex items-center">
              <AddTag
                tags={editingCard.tags}
                addTag={handleAddTag}
                removeTag={handleDeleteTag}
                editTag={handleEditTag}
              />
            </div>
          </div>
        )
      )}
    </Modal>
  );
};

export default CardPreview;
