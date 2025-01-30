import { useMemo, useState } from 'react';
import { Descendant } from 'slate';
import { App } from 'antd';
import { useMemoizedFn } from 'ahooks';
import { VecDocument } from '@/types';
import { deleteVecDocumentsByRef } from '@/commands';
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import { embeddingContent, getMarkdown } from '@/utils';
import React from 'react';


interface Params<T> {
  selectedRows: T[];
  setSelectedRows: React.Dispatch<React.SetStateAction<T[]>>;
  type: string;
  vecDocuments: VecDocument[];
  initVecDocuments: () => Promise<void>;
}

const EMBEDDING_MODEL = 'text-embedding-3-large';

const useBatchOperation = <T extends { id: number, content: Descendant[], update_time: number }, >(params: Params<T>) => {
  const {
    selectedRows,
    setSelectedRows,
    type,
    vecDocuments,
    initVecDocuments
  } = params;

  const { message } = App.useApp();

  const {
    provider
  } = useSettingStore(state => ({
    provider: state.setting.llmProviders[ELLMProvider.OPENAI]
  }));
  const { configs, currentConfigId } = provider;
  const currentConfig = configs.find(item => item.id === currentConfigId);

  const [createEmbeddings, updateEmbeddings, deleteEmbeddings] = useMemo(() => {
    const createEmbddings: T[] = [];
    const updateEmbeddings: T[] = [];
    const deleteEmbeddings: T[] = [];
    selectedRows.forEach(embedding => {
      const embddingedCards = vecDocuments.filter(vecDocument => vecDocument.refId === embedding.id);
      if (embddingedCards.length === 0) {
        createEmbddings.push(embedding);
      } else {
        const embeddingTime = embddingedCards[0].refUpdateTime;
        const cardUpdateTime = embedding.update_time;
        if (cardUpdateTime > embeddingTime) {
          updateEmbeddings.push(embedding);
        }else {
          deleteEmbeddings.push(embedding);
        }
      }
    });

    return [createEmbddings, updateEmbeddings, deleteEmbeddings];
  }, [selectedRows, vecDocuments]);

  const [batchCreateOrUpdateTotal, setBatchCreateOrUpdateTotal] = useState(0);
  const [batchCreateOrUpdateSuccess, setBatchCreateOrUpdateSuccess] = useState(0);
  const [batchCreateOrUpdateError, setBatchCreateOrUpdateError] = useState(0);
  const [batchCreateOrUpdateLoading, setBatchCreateOrUpdateLoading] = useState(false);

  const handleBatchEmbedding = useMemoizedFn(async () => {
    if (!currentConfig) {
      message.error('请先配置 OpenAI API Key');
      return;
    }

    setBatchCreateOrUpdateTotal(createEmbeddings.length + updateEmbeddings.length);
    setBatchCreateOrUpdateLoading(true);
    const successEmbeddings: T[] = [];
    // 因为接口速率限制，因此串行 embedding
    for (const embedding of createEmbeddings) {
      try {
        const markdown = getMarkdown(embedding.content);
        const { apiKey, baseUrl } = currentConfig;
        await embeddingContent(
          apiKey,
          baseUrl,
          EMBEDDING_MODEL,
          markdown, 
          embedding.id,
          type,
          embedding.update_time
        );
        setBatchCreateOrUpdateSuccess((prev) => prev + 1);
        successEmbeddings.push(embedding);
      } catch(e) {
        console.error(e);
        setBatchCreateOrUpdateError((prev) => prev + 1);
      }
    }

    for (const embedding of updateEmbeddings) {
      try {
        await deleteVecDocumentsByRef(embedding.id, type);
        const markdown = getMarkdown(embedding.content);
        const { apiKey, baseUrl } = currentConfig;
        await embeddingContent(
          apiKey,
          baseUrl,
          EMBEDDING_MODEL,
          markdown, 
          embedding.id,
          type,
          embedding.update_time
        );
        setBatchCreateOrUpdateSuccess((prev) => prev + 1);
        successEmbeddings.push(embedding);
      } catch(e) {
        console.error(e);
        setBatchCreateOrUpdateError((prev) => prev + 1);
      }
    }

    setBatchCreateOrUpdateLoading(false);
    if (successEmbeddings.length === createEmbeddings.length + updateEmbeddings.length) {
      message.success('批量嵌入成功');
    } else if (successEmbeddings.length === 0){
      message.error('批量嵌入失败');
    } else {
      message.warning(`部分嵌入失败，失败数：${createEmbeddings.length + updateEmbeddings.length - successEmbeddings.length}`);
    }

    // 选中那些处理失败的
    const successCardIds = successEmbeddings.map(c => c.id);
    const newSelectedRows = selectedRows.filter(card => !successCardIds.includes(card.id));
    setSelectedRows(newSelectedRows);
    await initVecDocuments();

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
      await deleteVecDocumentsByRef(embedding.id, type);
    }
    await initVecDocuments();
    setBatchDeleteLoading(false);
    message.success('批量删除成功');
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
    deleteEmbeddings
  }
}

export default useBatchOperation;