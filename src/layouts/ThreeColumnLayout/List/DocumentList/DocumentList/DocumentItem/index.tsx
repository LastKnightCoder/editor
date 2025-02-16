import { useState } from "react";
import { IDocument } from "@/types";
import { MdMoreVert } from 'react-icons/md';

import styles from './index.module.less';
import { Popover } from "antd";

interface IDocumentItemProps {
  document: IDocument;
  onClick: (document: IDocument) => void;
  onEdit: (document: IDocument) => void;
  onDelete: (document: IDocument) => void;
}

const DocumentItem = (props: IDocumentItemProps) => {
  const { document, onEdit, onClick, onDelete } = props;

  const [settingPanelOpen, setSettingPanelOpen] = useState(false);

  return (
    <div className={styles.itemContainer} onClick={() => {
      onClick(document);
    }}>
      <div className={styles.title}>{document.title || '无标题'}</div>
      <div className={styles.desc}>{document.desc || '无内容'}</div>
      <Popover
        open={settingPanelOpen}
        onOpenChange={setSettingPanelOpen}
        trigger={'click'}
        content={(
          <div className={styles.settings}>
            <div className={styles.item} onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onEdit(document);
              setSettingPanelOpen(false);
            }}>编辑文档</div>
            <div className={styles.item} onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDelete(document);
              setSettingPanelOpen(false);
            }}>删除文档</div>
          </div>
        )}
        styles={{
          body: {
            padding: 4
          }
        }}
        arrow={false}
        placement={'bottomLeft'}
      >
        <div className={styles.moreIcon} onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}>
          <MdMoreVert />
        </div>
      </Popover>
    </div>
  )
}

export default DocumentItem;
