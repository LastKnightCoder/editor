import {useEffect, useState, useRef} from "react";
import { useRafInterval } from 'ahooks';
import { Skeleton, Tag } from "antd";
import isHotkey from "is-hotkey";
import dayjs from "dayjs";
import { MdAccessTime } from "react-icons/md";
import { FaTags } from "react-icons/fa6";

import Editor, { EditorRef } from '@/components/Editor';
import AddTag from "@/components/AddTag";
import LinkList from './LinkList';

import { cardLinkExtension } from "@/editor-extensions";

import useEditCard from "../hooks/useEditCard.ts";

import styles from './index.module.less';


const customExtensions = [cardLinkExtension];

interface IEditCardProps {
  cardId: number;
  onClickLinkCard: (id: number) => Promise<void>;
}

const EditCard = (props: IEditCardProps) => {
  const { cardId, onClickLinkCard } = props;

  const [readonly, setReadonly] = useState(false);
  const editorRef = useRef<EditorRef>(null);

  const {
    initValue,
    editingCard,
    loading,
    saveCard,
    onContentChange,
    onAddTag,
    onDeleteTag,
    onAddLink,
    onRemoveLink,
  } = useEditCard(cardId);

  useRafInterval(() => {
    saveCard();
  }, 3000);

  useEffect(() => {
    return () => {
      saveCard();
    }
  }, [saveCard]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+/', e)) {
        setReadonly(!readonly);
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [readonly]);

  if (loading) return <Skeleton active />;

  if (!editingCard) return null;

  return (
    <div className={styles.editCardContainer}>
      <div className={styles.fields}>
        <div className={styles.title}>卡片属性</div>
        <div className={styles.field}>
          <div className={styles.fieldKey}>
            <MdAccessTime className={styles.icon} />
            <span>创建时间</span>
          </div>
          <div className={styles.fieldValue}>
            <Tag color={'red'}>{dayjs(editingCard.create_time).format('YYYY/MM/DD HH:mm:ss')}</Tag>
          </div>
        </div>
        <div className={styles.field}>
          <div className={styles.fieldKey}>
            <MdAccessTime className={styles.icon} />
            <span>更新时间</span>
          </div>
          <div className={styles.fieldValue}>
            <Tag color={'purple'}>{dayjs(editingCard.update_time).format('YYYY/MM/DD HH:mm:ss')}</Tag>
          </div>
        </div>
        <div  className={styles.field}>
          <div className={styles.fieldKey}>
            <FaTags className={styles.icon} />
            <span>标签</span>
          </div>
          <div className={styles.fieldValue}>
            <AddTag tags={editingCard.tags} addTag={onAddTag} removeTag={onDeleteTag} readonly={readonly} />
          </div>
        </div>
      </div>

      <div className={styles.editor}>
        <Editor
          ref={editorRef}
          initValue={initValue}
          onChange={onContentChange}
          extensions={customExtensions}
          readonly={readonly}
        />
      </div>

      <div className={styles.links}>
        <div className={styles.title}>关联卡片</div>
        <LinkList
          onClickLinkCard={onClickLinkCard}
          addLink={onAddLink}
          removeLink={onRemoveLink}
          editingCard={editingCard}
          readonly={readonly}
        />
      </div>
    </div>
  )
}

export default EditCard;