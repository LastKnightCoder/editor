import { useReadOnly } from "slate-react";
import { motion } from "framer-motion";
import classnames from "classnames";
import { PlusOutlined } from "@ant-design/icons";
import { MdOutlineClear } from "react-icons/md";

import { ITabsContent } from "@/components/Editor/types";
import If from "@/components/If";

import styles from './index.module.less';

interface ITabsHeaderProps {
  tabs: ITabsContent[];
  activeKey: string;
  bottomLineId: string;
  onClickTab: (key: string) => void;
  onDeleteTab: (key: string) => void;
  onAddTab: () => void;
  onTitleChange: (key: string, title: string) => void;
}

const TabsHeader = (props: ITabsHeaderProps) => {
  const { tabs, activeKey, onAddTab, onClickTab, onDeleteTab, onTitleChange, bottomLineId } = props;
  const readOnly = useReadOnly();

  return (
    <motion.div className={styles.tabHeaderContainer} contentEditable={false}>
      {tabs.map(tab => (
        <motion.div
          key={tab.key}
          className={classnames(styles.tabHeaderItem, { [styles.active]: tab.key === activeKey })}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClickTab(tab.key);
          }}
        >
          <div className={styles.content}>
            <div
              data-slate-editor
              // @ts-ignore
              contentEditable={readOnly ? false : 'plaintext-only'}
              suppressContentEditableWarning
              onBlur={(e) => {
                e.stopPropagation();
                onTitleChange(tab.key, e.currentTarget.innerText);
              }}
              style={{
                cursor: readOnly ? 'pointer' : 'text',
              }}
            >
              {tab.title}
            </div>
            <If condition={!readOnly}>
              <div
                className={styles.deleteIcon}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteTab(tab.key);
                }}
              >
                <MdOutlineClear />
              </div>
            </If>
          </div>
          <If condition={tab.key === activeKey}>
            <motion.div
              className={styles.bottomLine}
              layoutId={bottomLineId}
            />
          </If>
        </motion.div>
      ))}
      <If condition={!readOnly}>
        <div className={styles.addTabBtn} onClick={onAddTab}>
          <PlusOutlined />
        </div>
      </If>
    </motion.div>
  )
}

export default TabsHeader;