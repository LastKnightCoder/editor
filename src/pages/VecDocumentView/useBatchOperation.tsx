import React, { useMemo, useState } from "react";
import { Descendant } from "slate";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import { SearchResult, IndexParams, IndexType } from "@/types";
import { getMarkdown, batchIndexContent, removeIndex } from "@/utils";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";

interface Params<T> {
  selectedRows: T[];
  setSelectedRows: React.Dispatch<React.SetStateAction<T[]>>;
  type: string;
  vecResults: SearchResult[];
  initIndexResults: () => Promise<void>;
}

const useBatchOperation = <
  T extends { id: number; content: Descendant[]; update_time: number },
>(
  params: Params<T>,
) => {
  const { selectedRows, setSelectedRows, type, vecResults, initIndexResults } =
    params;

  const { message } = App.useApp();
  const modelInfo = useEmbeddingConfig();

  const [createEmbeddings, updateEmbeddings, deleteEmbeddings] = useMemo(() => {
    const createEmbeddings: T[] = [];
    const updateEmbeddings: T[] = [];
    const deleteEmbeddings: T[] = [];

    selectedRows.forEach((item) => {
      // 查找向量索引结果
      const vecResult = vecResults.find(
        (result) => result.id === item.id && result.type === type,
      );

      // 如果没有索引，则添加到创建列表
      if (!vecResult) {
        createEmbeddings.push(item);
      }
      // 如果有索引但需要更新
      else if (item.update_time > vecResult.updateTime) {
        updateEmbeddings.push(item);
      }
      // 如果有索引且不需要更新，则添加到删除列表
      else {
        deleteEmbeddings.push(item);
      }
    });

    return [createEmbeddings, updateEmbeddings, deleteEmbeddings];
  }, [selectedRows, vecResults, type]);

  const [batchCreateOrUpdateTotal, setBatchCreateOrUpdateTotal] = useState(0);
  const [batchCreateOrUpdateSuccess, setBatchCreateOrUpdateSuccess] =
    useState(0);
  const [batchCreateOrUpdateError, setBatchCreateOrUpdateError] = useState(0);
  const [batchCreateOrUpdateLoading, setBatchCreateOrUpdateLoading] =
    useState(false);

  const handleBatchEmbedding = useMemoizedFn(async () => {
    setBatchCreateOrUpdateTotal(
      createEmbeddings.length + updateEmbeddings.length,
    );
    setBatchCreateOrUpdateLoading(true);
    const successEmbeddings: T[] = [];

    // 准备批量索引参数
    const batchItems: IndexParams[] = [];

    // 准备创建索引的项
    for (const item of createEmbeddings) {
      const markdown = getMarkdown(item.content);

      const itemIndexParams: IndexParams = {
        id: item.id,
        content: markdown,
        type: type as IndexType,
        updateTime: item.update_time,
        modelInfo,
      };

      batchItems.push(itemIndexParams);
    }

    // 准备更新索引的项
    for (const item of updateEmbeddings) {
      const markdown = getMarkdown(item.content);

      const itemIndexParams: IndexParams = {
        id: item.id,
        content: markdown,
        type: type as IndexType,
        updateTime: item.update_time,
        modelInfo,
      };

      batchItems.push(itemIndexParams);
    }

    try {
      // 批量创建/更新索引，每批处理10个
      const batchSize = 10;
      let processedCount = 0;
      let successCount = 0;

      // 将项目分成多个批次处理
      for (let i = 0; i < batchItems.length; i += batchSize) {
        const currentBatch = batchItems.slice(i, i + batchSize);
        const result = await batchIndexContent(currentBatch);

        processedCount += currentBatch.length;

        if (result) {
          successCount += currentBatch.length;
          setBatchCreateOrUpdateSuccess(successCount);

          // 确定当前批次中哪些是创建操作，哪些是更新操作
          const currentBatchIds = currentBatch.map((item) => item.id);
          const currentCreateItems = createEmbeddings.filter((item) =>
            currentBatchIds.includes(item.id),
          );
          const currentUpdateItems = updateEmbeddings.filter((item) =>
            currentBatchIds.includes(item.id),
          );

          // 添加成功的项到成功列表
          successEmbeddings.push(...currentCreateItems, ...currentUpdateItems);
        } else {
          setBatchCreateOrUpdateError(processedCount - successCount);
        }

        // 更新进度
        message.loading({
          content: `正在处理: ${processedCount}/${batchItems.length}`,
          key: "batchProgress",
        });
      }

      // 清除进度消息并显示最终结果
      if (successCount === batchItems.length) {
        message.success({ content: "批量索引成功", key: "batchProgress" });
      } else if (successCount === 0) {
        message.error({ content: "批量索引失败", key: "batchProgress" });
      } else {
        message.warning({
          content: `部分索引失败，失败数：${batchItems.length - successCount}`,
          key: "batchProgress",
        });
      }
    } catch (e) {
      console.error(e);
      setBatchCreateOrUpdateError(
        batchItems.length - batchCreateOrUpdateSuccess,
      );
      message.error({ content: "批量索引出错", key: "batchProgress" });
    }

    setBatchCreateOrUpdateLoading(false);

    // 选中那些处理失败的
    const successCardIds = successEmbeddings.map((c) => c.id);
    const newSelectedRows = selectedRows.filter(
      (card) => !successCardIds.includes(card.id),
    );
    setSelectedRows(newSelectedRows);
    await initIndexResults();

    setTimeout(() => {
      setBatchCreateOrUpdateTotal(0);
      setBatchCreateOrUpdateSuccess(0);
      setBatchCreateOrUpdateError(0);
    }, 2000);
  });

  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const handleBatchDelete = useMemoizedFn(async () => {
    setBatchDeleteLoading(true);
    for (const embedding of deleteEmbeddings) {
      await removeIndex(embedding.id, type as IndexType);
    }
    await initIndexResults();
    setBatchDeleteLoading(false);
    message.success("批量删除索引成功");
  });

  return {
    batchCreateOrUpdateTotal,
    batchCreateOrUpdateSuccess,
    batchCreateOrUpdateError,
    batchCreateOrUpdateLoading,
    handleBatchEmbedding,
    handleBatchDelete,
    batchDeleteLoading,
    createEmbeddings,
    updateEmbeddings,
    deleteEmbeddings,
  };
};

export default useBatchOperation;
