import { useReadOnly } from "slate-react";
import { PlusOutlined } from "@ant-design/icons";

import { ITabsContent } from "@/components/Editor/types";
import If from "@/components/If";
import TabTitle from "../TabTitle";

import styles from "./index.module.less";

interface ITabsHeaderProps {
  tabs: ITabsContent[];
  activeKey: string;
  onClickTab: (key: string) => void;
  onDeleteTab: (key: string) => void;
  onAddTab: () => void;
  onTitleChange: (key: string, title: string) => void;
}

const TabsHeader = (props: ITabsHeaderProps) => {
  const { tabs, activeKey, onAddTab, onClickTab, onDeleteTab, onTitleChange } =
    props;
  const readOnly = useReadOnly();

  return (
    <div className={styles.tabHeaderContainer} contentEditable={false}>
      {tabs.map((tab) => (
        <TabTitle
          key={tab.key}
          tab={tab}
          activeKey={activeKey}
          onClickTab={onClickTab}
          onDeleteTab={onDeleteTab}
          onTitleChange={onTitleChange}
        />
      ))}
      <If condition={!readOnly}>
        <div className={styles.addTabBtn} onClick={onAddTab}>
          <PlusOutlined />
        </div>
      </If>
    </div>
  );
};

export default TabsHeader;
