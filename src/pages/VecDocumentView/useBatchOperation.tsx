import React, { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Descendant } from "slate";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import { SearchResult, IndexParams, IndexType } from "@/types";
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import { getMarkdown, batchIndexContent, removeIndex } from "@/utils";

interface Params<T> {
  selectedRows: T[];
  setSelectedRows: React.Dispatch<React.SetStateAction<T[]>>;
  type: string;
  indexResults: [SearchResult[], SearchResult[]]; // [ftsResults, vecResults]
  initIndexResults: () => Promise<void>;
}

const EMBEDDING_MODEL = "text-embedding-3-large";

const useBatchOperation = <
  T extends { id: number; content: Descendant[]; update_time: number },
>(
  params: Params<T>,
) => {
  const {
    selectedRows,
    setSelectedRows,
    type,
    indexResults,
    initIndexResults,
  } = params;

  const { message } = App.useApp();

  const { provider } = useSettingStore(
    useShallow((state) => ({
      provider: state.setting.llmProviders[ELLMProvider.OPENAI],
    })),
  );
  const { configs, currentConfigId } = provider;
  const currentConfig = configs.find((item) => item.id === currentConfigId);

  // 解构索引结果
  const [ftsResults, vecResults] = indexResults;

  const [createEmbeddings, updateEmbeddings, deleteEmbeddings] = useMemo(() => {
    const createEmbddings: T[] = [];
    const updateEmbeddings: T[] = [];
    const deleteEmbeddings: T[] = [];

    selectedRows.forEach((item) => {
      // 查找FTS索引结果
      const ftsResult = ftsResults.find(
        (result) => result.id === item.id && result.type === type,
      );

      // 查找向量索引结果
      const vecResult = vecResults.find(
        (result) => result.id === item.id && result.type === type,
      );

      // 如果没有任何索引，则添加到创建列表
      if (!ftsResult && !vecResult) {
        createEmbddings.push(item);
      }
      // 如果有索引但需要更新
      else if (
        (vecResult && item.update_time !== vecResult.updateTime) ||
        (ftsResult && item.update_time !== ftsResult.updateTime)
      ) {
        updateEmbeddings.push(item);
      }
      // 如果有索引且不需要更新，则添加到删除列表
      else {
        deleteEmbeddings.push(item);
      }
    });

    return [createEmbddings, updateEmbeddings, deleteEmbeddings];
  }, [selectedRows, ftsResults, vecResults, type]);

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
      };

      if (currentConfig) {
        itemIndexParams.modelInfo = {
          key: currentConfig.apiKey,
          baseUrl: currentConfig.baseUrl,
          model: EMBEDDING_MODEL,
        };
      }

      batchItems.push(itemIndexParams);
    }

    // 准备更新索引的项
    for (const item of updateEmbeddings) {
      const markdown = getMarkdown(item.content);

      const indexTypes: ("fts" | "vec")[] = [];
      const ftsResult = ftsResults.find(
        (result) => result.id === item.id && result.type === type,
      );

      const vecResult = vecResults.find(
        (result) => result.id === item.id && result.type === type,
      );
      if (!ftsResult || item.update_time !== ftsResult.updateTime)
        indexTypes.push("fts");
      if (!vecResult || item.update_time !== vecResult.updateTime)
        indexTypes.push("vec");

      const itemIndexParams: IndexParams = {
        id: item.id,
        content: markdown,
        type: type as IndexType,
        updateTime: item.update_time,
        indexTypes,
      };

      if (currentConfig) {
        itemIndexParams.modelInfo = {
          key: currentConfig.apiKey,
          baseUrl: currentConfig.baseUrl,
          model: EMBEDDING_MODEL,
        };
      }

      batchItems.push(itemIndexParams);
    }

    try {
      // 批量创建/更新索引
      const result = await batchIndexContent(batchItems);

      if (result) {
        setBatchCreateOrUpdateSuccess(batchItems.length);
        successEmbeddings.push(...createEmbeddings, ...updateEmbeddings);
      } else {
        setBatchCreateOrUpdateError(batchItems.length);
      }
    } catch (e) {
      console.error(e);
      setBatchCreateOrUpdateError(batchItems.length);
    }

    setBatchCreateOrUpdateLoading(false);
    if (
      successEmbeddings.length ===
      createEmbeddings.length + updateEmbeddings.length
    ) {
      message.success("批量索引成功");
    } else if (successEmbeddings.length === 0) {
      message.error("批量索引失败");
    } else {
      message.warning(
        `部分索引失败，失败数：${createEmbeddings.length + updateEmbeddings.length - successEmbeddings.length}`,
      );
    }

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
