import { useState, useEffect } from "react";
import { TableColumnsType, Tag, App, Button, Popover, Flex, Typography } from 'antd';
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";

import OperationBtn from "./OperationBtn.tsx";
import AutoHeightTable from "@/components/AutoHeightTable";
import Editor from "@/components/Editor";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";

import { formatDate, getEditorText } from "@/utils";
import { embeddingCard } from '@/utils';
import { getVecDocumentsByRefType, deleteVecDocumentsByRef } from "@/commands";
import { ECardCategory, ICard, VecDocument } from "@/types";

import styles from './index.module.less';


const PAGE_SIZE = 20;
const EMBEDDING_MODEL = 'text-embedding-3-large';

const VecDocumentView = () => {
  const { message } = App.useApp();

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }));

  const {
    provider
  } = useSettingStore(state => ({
    provider: state.setting.llmProviders[ELLMProvider.OPENAI]
  }));

  const { configs, currentConfigId } = provider;
  const currentConfig = configs.find(item => item.id === currentConfigId);

  const [cardVecDocuments, setCardVecDocuments] = useState<VecDocument[]>([]);
  const [current, setCurrent] = useState(1);
  const slicedCards = cards.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const initCardVecDocuments = useMemoizedFn(async () => {
    const vecDocuments = await getVecDocumentsByRefType('card');
    setCardVecDocuments(vecDocuments);
  });

  useEffect(() => {
    initCardVecDocuments().then();
  }, [initCardVecDocuments]);

  const onCreateEmbedding = useMemoizedFn(async (markdown: string, record: ICard) => {
    if (!currentConfig) {
      message.error('未配置 OpenAI');
      return;
    }
    const { apiKey, baseUrl } = currentConfig;
    await embeddingCard(apiKey, baseUrl, EMBEDDING_MODEL, markdown, record.id, record.update_time);
    await initCardVecDocuments();
    message.success('创建成功');
  });

  const onRemoveEmbedding = useMemoizedFn(async (record: ICard) => {
    await deleteVecDocumentsByRef(record.id, 'card');
    await initCardVecDocuments();
    message.success('删除成功');
  });

  const onUpdateEmbedding = useMemoizedFn(async (markdown: string, record: ICard) => {
    if (!currentConfig) {
      message.error('未配置 OpenAI');
      return;
    }
    const { apiKey, baseUrl } = currentConfig;
    await deleteVecDocumentsByRef(record.id, 'card');
    await embeddingCard(apiKey, baseUrl, EMBEDDING_MODEL, markdown, record.id, record.update_time);
    await initCardVecDocuments();
    message.success('更新成功');
  });

  // @ts-ignore
  const columns: TableColumnsType<ICard> = [{
    key: 'id',
    dataIndex: 'id',
    title: 'ID',
    width: 80,
  }, {
    key: 'create_time',
    dataIndex: 'create_time',
    title: '创建时间',
    width: 160,
    render: (createTime: number) => {
      return (
        <div>{formatDate(createTime, true)}</div>
      )
    }
  }, {
    key: 'update_time',
    dataIndex: 'update_time',
    title: '更新时间',
    width: 160,
    render: (updateTime: number) => {
      return (
        <div>{formatDate(updateTime, true)}</div>
      )
    }
  }, {
    key: 'content',
    dataIndex: 'content',
    title: '卡片内容',
    render: (content: Descendant[]) => {
      return (
        <Flex vertical gap={12} align={'flex-start'}>
          <Typography.Paragraph
            ellipsis={{ rows: 1 }}
            style={{ maxWidth: 400 }}
          >
            {getEditorText(content, 20)}
          </Typography.Paragraph>
          <Popover
            trigger={'hover'}
            placement={'bottom'}
            content={(
              <Editor
                style={{
                  maxWidth: 400,
                  maxHeight: 300,
                  overflow: 'auto'
                }}
                readonly
                initValue={content}
              />
            )}
          >
            <Button
              style={{ padding: 0 }}
              type={'link'}
            >
              查看更多
            </Button>
          </Popover>
        </Flex>
      )
    }
  }, {
    key: 'category',
    dataIndex: 'category',
    title: '分类',
    width: 80,
    render: (category: ICard['category']) => {
      let text = '';
      let color = '';
      if (category === ECardCategory.Permanent) {
        text = '永久笔记';
        color = 'blue';
      } else if (category === ECardCategory.Temporary) {
        text = '闪念笔记';
        color = 'green';
      } else if (category === ECardCategory.Theme) {
        text = '主题笔记';
        color = 'orange';
      }

      return (
        <Tag color={color}>{text}</Tag>
      )
    }
  }, {
    key: 'tags',
    dataIndex: 'tags',
    title: '标签',
    render: (tags: string[]) => {
      return (
        <>
          { tags.map(tag => (
            <Tag color="blue" key={tag}>{tag}</Tag>
          )) }
        </>
      )
    }
  }, {
    key: 'embedding_status',
    title: '嵌入状态',
    width: 120,
    render: (_, record) => {
      const vecDocuments = cardVecDocuments.filter(vecDocument => vecDocument.refId === record.id);
      if (vecDocuments.length === 0) {
        return (
          <Tag color="red">未嵌入</Tag>
        )
      } else {
        const embeddingTime = vecDocuments[0].refUpdateTime;
        const cardUpdateTime = record.update_time;
        if (cardUpdateTime > embeddingTime) {
          return (
            <Tag color={'orange'}>已嵌入（待更新）</Tag>
          )
        } else {
          return (
            <Tag color={'green'}>已嵌入</Tag>
          )
        }
      }
    }
  }, {
    key: 'operations',
    title: '操作',
    fixed: 'right',
    render: (_, record) => {
      const vecDocuments = cardVecDocuments.filter(vecDocument => vecDocument.refId === record.id);
      if (vecDocuments.length === 0) {
        return (
          <OperationBtn
            card={record}
            onClick={async (markdown) => {
              await onCreateEmbedding(markdown, record);
            }}
            btnText={'创建嵌入'}
          />
        )
      } else {
        const embeddingTime = vecDocuments[0].refUpdateTime;
        const cardUpdateTime = record.update_time;
        if (cardUpdateTime > embeddingTime) {
          return (
            <>
              <OperationBtn
                card={record}
                onClick={async (markdown) => {
                  await onUpdateEmbedding(markdown, record);
                }}
                btnText={'更新嵌入'}
              />
              <OperationBtn
                card={record}
                danger
                onClick={async () => {
                  await onRemoveEmbedding(record);
                }}
                btnText={'删除嵌入'}
              />
            </>
          )
        } else {
          return (
            <OperationBtn
              card={record}
              onClick={async () => {
                await onRemoveEmbedding(record);
              }}
              btnText={'删除嵌入'}
            />
          )
        }
      }
    }
  }];

  return (
    <div className={styles.container}>
      <Flex vertical gap={12} style={{ width: '100%', height: '100%', maxWidth: '100%' }}>
        {/*<Flex justify={'flex-end'} gap={12}>*/}
        {/*  <Button>更新或创建嵌入</Button>*/}
        {/*  <Button danger>取消嵌入</Button>*/}
        {/*</Flex>*/}
        <AutoHeightTable
          style={{
            flex: 1
          }}
          scroll={{
            x: true,
          }}
          pagination={{
            pageSize: PAGE_SIZE,
            current,
            total: cards.length,
            showSizeChanger: false
          }}
          dataSource={slicedCards}
          // @ts-ignore
          columns={columns}
          onChange={(pagination) => {
            setCurrent(pagination.current || 1);
          }}
        />
      </Flex>

      {/*<div style={{ height: 60, padding: 12, boxSizing: 'border-box', display: 'flex', alignItems: 'center', borderRadius:30, border: '1px solid red' }}>*/}
      {/*  <EditText*/}
      {/*    style={{ flex: 1 }}*/}
      {/*    ref={searchTextRef}*/}
      {/*    contentEditable={true}*/}
      {/*    onPressEnter={async () => {*/}
      {/*      if (!currentConfig || !searchTextRef.current) return;*/}
      {/*      searchTextRef.current.blur();*/}
      {/*      const { apiKey, baseUrl } = currentConfig;*/}
      {/*      const searchText = searchTextRef.current.getValue();*/}
      {/*      const queryEmbedding = await embeddingOpenAI(apiKey, baseUrl, 'text-embedding-3-large', searchText);*/}
      {/*      const vecDocuments = await searchVecDocuments(queryEmbedding, 5);*/}
      {/*      console.log('vecDocuments', vecDocuments);*/}
      {/*      searchTextRef.current.clear();*/}
      {/*      searchTextRef.current.focus();*/}
      {/*    }}*/}
      {/*  />*/}
      {/*  /!*<Button>搜索</Button>*!/*/}
      {/*</div>*/}
    </div>
  )
}

export default VecDocumentView;
