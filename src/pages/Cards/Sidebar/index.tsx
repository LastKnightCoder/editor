import { useState } from "react";
import {  UnorderedListOutlined, TagsOutlined } from "@ant-design/icons";
import classnames from "classnames";

import If from "@/components/If";
import TagsManagement from "../TagsManagement";
import CardList from '../CardList';

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { cardCategoryName } from "@/constants";
import { ECardCategory } from '@/types';

import styles from "./index.module.less";
import { Select } from "antd";

interface ISidebarProps {
  editingCardId?: number;
  onDeleteCard: (id: number) => Promise<void>;
  onCreateCard: () => Promise<void>;
  onClickCard: (id: number) => void;
}

const Sidebar = (props: ISidebarProps) => {
  const { editingCardId, onDeleteCard, onCreateCard, onClickCard } = props;
  const [activeTab, setActiveTab] = useState<'all' | 'tags'>('all'); // ['all', 'tags']

  const {
    sidebarWidth,
  } = useGlobalStateStore((state) => ({
    sidebarWidth: state.sidebarWidth,
  }));

  const {
    selectCategory
  } = useCardsManagementStore((state) => ({
    selectCategory: state.selectCategory
  }));

  return (
    <div className={styles.sidebar} style={{
      width: sidebarWidth,
    }}>
      <div className={styles.selectTab}>
        <div className={classnames(styles.icon, { [styles.select]: activeTab === 'all' })} onClick={() => { setActiveTab('all') }}>
          <UnorderedListOutlined />
        </div>
        <div className={classnames(styles.icon, { [styles.select]: activeTab === 'tags' })} onClick={() => { setActiveTab('tags') }}>
          <TagsOutlined />
        </div>
        <div className={styles.category}>
          <Select
            value={selectCategory}
            options={Object.keys(cardCategoryName).map((key) => ({
              label: cardCategoryName[key as ECardCategory],
              value: key,
            }))}
            onChange={(value) => {
              useCardsManagementStore.setState({
                selectCategory: value,
              })
            }}
          ></Select>
        </div>
      </div>
      <If condition={activeTab === 'tags'}>
        <TagsManagement
          onClickCard={onClickCard}
          editingCardId={editingCardId}
        />
      </If>
      <If condition={activeTab === 'all'}>
        <CardList
          onDeleteCard={onDeleteCard}
          onCreateCard={onCreateCard}
          onClickCard={onClickCard}
          editingCardId={editingCardId}
        />
      </If>
    </div>
  )
}

export default Sidebar;