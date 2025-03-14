import { Flex, Select } from "antd";

import AutoHeightTable from "@/components/AutoHeightTable";
import useTableConfig from "./useTableConfig";
import styles from "./index.module.less";
import { useState } from "react";

const VecDocumentView = () => {
  const [embeddingType, setEmbeddingType] = useState("card");
  const tableConfig = useTableConfig(embeddingType);
  if (!tableConfig) return null;

  const {
    dataSource,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode,
  } = tableConfig;

  return (
    <div className={styles.container}>
      <Flex
        vertical
        gap={12}
        style={{ width: "100%", height: "100%", maxWidth: "100%" }}
      >
        <Flex gap={12} justify="space-between">
          <Select value={embeddingType} onChange={setEmbeddingType}>
            <Select.Option value="card">卡片</Select.Option>
            <Select.Option value="article">文章</Select.Option>
          </Select>
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
          // @ts-ignore
          columns={columns}
          onChange={onChange}
          // @ts-ignore
          rowSelection={rowSelection}
        />
      </Flex>
    </div>
  );
};

export default VecDocumentView;
