import { Breadcrumb, Flex, Select } from "antd";
import { useNavigate } from "react-router-dom";

import AutoHeightTable from "@/components/AutoHeightTable";
import useTableConfig from "./useTableConfig";

import { useState, memo } from "react";
import { IndexType } from "@/types";
import Titlebar from "@/components/Titlebar";

import styles from "./index.module.less";

const VecDocumentView = memo(() => {
  const [indexType, setIndexType] = useState<IndexType>("card");
  const tableConfig = useTableConfig(indexType);
  const navigate = useNavigate();

  if (!tableConfig) return null;

  const {
    dataSource,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode,
    leftExtraNode,
  } = tableConfig;

  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "索引数据库", path: "/vec-documents/" },
  ];

  return (
    <div className={styles.container}>
      <Titlebar className={styles.titlebar}>
        <Breadcrumb
          className={styles.breadcrumb}
          items={breadcrumbItems.map((item) => ({
            title: (
              <span
                className={styles.breadcrumbItem}
                onClick={() => navigate(item.path)}
              >
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
      <div className={styles.content}>
        <Flex
          vertical
          gap={12}
          style={{ width: "100%", height: "100%", maxWidth: "100%" }}
        >
          <Flex gap={12} justify="space-between">
            <Flex gap={12} align="center">
              <Select value={indexType} onChange={setIndexType}>
                <Select.Option value="card">卡片</Select.Option>
                <Select.Option value="article">文章</Select.Option>
                <Select.Option value="project-item">项目</Select.Option>
                <Select.Option value="document-item">知识库</Select.Option>
                <Select.Option value="log-entry">日志</Select.Option>
              </Select>
              {leftExtraNode}
            </Flex>
            {rightExtraNode}
          </Flex>
          <AutoHeightTable
            style={{
              flex: 1,
            }}
            scroll={{
              x: true,
            }}
            rowKey={"id"}
            pagination={pagination}
            dataSource={dataSource}
            columns={columns}
            onChange={onChange}
            rowSelection={rowSelection}
          />
        </Flex>
      </div>
    </div>
  );
});

export default VecDocumentView;
