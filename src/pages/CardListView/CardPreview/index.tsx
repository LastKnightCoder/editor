import { useMemoizedFn, useCreation, useRafInterval, useUnmount } from "ahooks";
import { Button, Modal, Tooltip } from "antd";
import { Descendant } from "slate";
import { ExpandOutlined, CloseOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditCard from "@/pages/CardDetailView/useEditCard";
import useUploadResource from "@/hooks/useUploadResource";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { useEffect, useRef } from "react";
import { formatDate, defaultCardEventBus } from "@/utils";
import useEditContent from "@/hooks/useEditContent";
import styles from "./index.module.less";

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
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const isWindowFocused = useWindowFocus();

  const {
    initValue,
    loading,
    editingCard,
    onContentChange: onContentChangeFromEditCard,
    onAddTag,
    onDeleteTag,
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
    if (isWindowFocused && editingCard && editorRef.current?.isFocus()) {
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  }, 500);

  useUnmount(async () => {
    setTimeout(async () => {
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }, 200);
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (isWindowFocused && editorRef.current?.isFocus()) {
      throttleHandleEditorContentChange(content);
    }
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
    <div className={styles.header}>
      <div className={styles.time}>
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
      <div className={styles.actions}>
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
      className={styles.cardPreviewModal}
      width={800}
      styles={{
        body: {
          padding: "0 24px 24px",
        },
      }}
      destroyOnClose
    >
      {loading ? (
        <div className={styles.loading}>加载中...</div>
      ) : (
        editingCard && (
          <div className={styles.cardPreviewContainer}>
            <div className={styles.editorContainer}>
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
            <div className={styles.tagsContainer}>
              <AddTag
                tags={editingCard.tags}
                addTag={handleAddTag}
                removeTag={handleDeleteTag}
              />
            </div>
          </div>
        )
      )}
    </Modal>
  );
};

export default CardPreview;
