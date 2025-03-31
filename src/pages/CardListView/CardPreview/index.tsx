import { Descendant } from "slate";
import { useMemoizedFn, useCreation, useRafInterval } from "ahooks";
import { Button, Modal, Tooltip } from "antd";
import { ExpandOutlined, CloseOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditCard from "@/pages/CardDetailView/useEditCard";
import useUploadResource from "@/hooks/useUploadResource";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import { formatDate } from "@/utils/time";
import { useEffect, useRef } from "react";
import { defaultCardEventBus } from "@/utils";
import styles from "./index.module.less";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

interface CardPreviewProps {
  cardId: number | undefined;
  visible: boolean;
  onClose: () => void;
}

const CardPreview = (props: CardPreviewProps) => {
  const { cardId, visible, onClose } = props;
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
    onInit,
    onContentChange,
    onAddTag,
    onDeleteTag,
    saveCard,
  } = useEditCard(cardId);

  const uploadResource = useUploadResource();

  useEffect(() => {
    if (visible && editingCard) {
      const unsubscribe = cardEventBus.subscribeToCardWithId(
        "card:updated",
        editingCard.id,
        (data) => {
          editorRef.current?.setEditorValue(data.card.content);
        },
      );
      return () => {
        unsubscribe();
      };
    }
  }, [cardId, visible, cardEventBus, editingCard]);

  useRafInterval(() => {
    if (isWindowFocused && editingCard) {
      saveCard();
    }
  }, 3000);

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    onAddTag(tag);
    if (editingCard) {
      cardEventBus.publishCardEvent("card:updated", {
        ...editingCard,
        tags: [...editingCard.tags, tag],
      });
    }
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    onDeleteTag(tag);
    if (editingCard) {
      cardEventBus.publishCardEvent("card:updated", {
        ...editingCard,
        tags: editingCard.tags.filter((t) => t !== tag),
      });
    }
  });

  const handleClose = useMemoizedFn(() => {
    saveCard();
    onClose();
  });

  const handleGoToDetail = useMemoizedFn(() => {
    if (editingCard) {
      saveCard();
      navigate(`/cards/detail/${editingCard.id}`);
    }
  });

  const onChange = useMemoizedFn((value: Descendant[]) => {
    if (!editingCard || !editorRef.current?.isFocus() || !isWindowFocused)
      return;
    onContentChange(value);
    cardEventBus.publishCardEvent("card:updated", {
      ...editingCard,
      content: value,
    });
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
                  onChange={onChange}
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
