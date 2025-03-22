import { Dropdown, MenuProps, Select } from "antd";
import { useMemoizedFn } from "ahooks";
import { memo } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { ECardCategory } from "@/types";
import { cardCategoryName } from "@/constants";
import styles from "./index.module.less";

interface CardHeaderProps {
  selectCategory: ECardCategory;
  onSelectCategoryChange: (category: ECardCategory) => void;
  onCreateCard: () => void;
  onImportMarkdown: () => void;
}

const CardHeader = memo(
  ({
    selectCategory,
    onSelectCategoryChange,
    onCreateCard,
    onImportMarkdown,
  }: CardHeaderProps) => {
    const menuItems: MenuProps["items"] = [
      {
        label: "创建卡片",
        key: "create-card",
      },
      {
        label: "导入Markdown",
        key: "import-markdown",
      },
    ];

    const handleClickCreate = useMemoizedFn(
      async ({ key }: { key: string }) => {
        if (key === "create-card") {
          onCreateCard();
        } else if (key === "import-markdown") {
          onImportMarkdown();
        }
      },
    );

    return (
      <div className={styles.header}>
        <div className={styles.left}>
          <div className={styles.title}>卡片</div>
          <Select
            value={selectCategory}
            options={Object.keys(cardCategoryName).map((key) => ({
              label: cardCategoryName[key as ECardCategory],
              value: key,
            }))}
            onChange={onSelectCategoryChange}
          />
        </div>
        <Dropdown
          menu={{
            items: menuItems,
            onClick: handleClickCreate,
          }}
        >
          <div className={styles.addCard}>
            <PlusOutlined />
          </div>
        </Dropdown>
      </div>
    );
  },
);

// 提供显示名称以便于调试
CardHeader.displayName = "CardHeader";

export default CardHeader;
