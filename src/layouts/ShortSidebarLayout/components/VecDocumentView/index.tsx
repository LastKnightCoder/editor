import { Flex, Select } from "antd";

import AutoHeightTable from "@/components/AutoHeightTable";
import useTableConfig from "./useTableConfig";
import styles from "./index.module.less";
import { useState } from "react";
import { IndexType } from "@/types";

const VecDocumentView = () => {
  const [indexType, setIndexType] = useState<IndexType>("card");
  const tableConfig = useTableConfig(indexType);

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

  return (
    <div className={styles.container}>
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
  );
};

export default VecDocumentView;
