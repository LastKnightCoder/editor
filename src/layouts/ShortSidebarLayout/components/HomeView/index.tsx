import { Card, Statistic, Row, Col, Popover } from 'antd';
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import styles from './index.module.less';
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import { useEffect, useMemo, useState } from "react";
import {
  getAllDocumentItems,
  getAllProjectItems,
  getLatestOperations,
  getRootDocumentsByDocumentItemId
} from '@/commands';
import { IArticle, ICard, IDocumentItem, Operation, ProjectItem } from "@/types";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useSettingStore from "@/stores/useSettingStore.ts";
import For from "@/components/For";
import { getEditorText } from "@/utils";
import Editor from "@editor/index.tsx";
import { useNavigate } from 'react-router-dom';
import useCardManagement from "@/hooks/useCardManagement.ts";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import CalendarHeatmap, { IItem } from '@/components/CalendarHeatmap';
import { getCalendarHeatmap } from "@/commands";
import dayjs from "dayjs";

const HomeView = () => {
  const navigate = useNavigate();

  const [operationData, setOperationData] = useState<IItem[]>([]);

  const [documentItems, setDocumentItems] = useState<IDocumentItem[]>([]);
  const [documentItemWordCounts, setDocumentItemWordCounts] = useState(0);

  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [projectItemWordCounts, setProjectItemWordCounts] = useState(0);

  const [latestOperations, setLatestOperations] = useState({
    cards: [] as ICard[],
    articles: [] as IArticle[],
    projectItems: [] as ProjectItem[],
    documentItems: [] as IDocumentItem[]
  })

  const {
    databaseStatus
  } = useGlobalStateStore(state => ({
    databaseStatus: state.databaseStatus
  }));

  const {
    active,
  } = useSettingStore(state => ({
    active: state.setting.database.active
  }))

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }));

  const {
    onCtrlClickCard
  } = useCardManagement();

  const {
    articles
  } = useArticleManagementStore(state => ({
    articles: state.articles
  }));

  const cardWordCounts = useMemo(() => {
    return cards.reduce((acc, card) => {
      return acc + card.count;
    }, 0);
  }, [cards]);

  const articleWordCounts = useMemo(() => {
    return articles.reduce((acc, article) => {
      return acc + article.count;
    }, 0);
  }, [articles]);

  useEffect(() => {
    if (!databaseStatus[active]) return;

    getAllDocumentItems().then(items => {
      setDocumentItems(items);
      setDocumentItemWordCounts(items.reduce((acc, item) => {
        return acc + item.count;
      }, 0));
    });

    getAllProjectItems().then(items => {
      setProjectItems(items);
      setProjectItemWordCounts(items.reduce((acc, item) => {
        return acc + item.count;
      }, 0));
    });

    getLatestOperations(5).then(operations => {
      // console.log('operations', operations);
      setLatestOperations(operations);
    });

    getCalendarHeatmap(dayjs().year()).then(data => {
      setOperationData(data.map((item) => ({
        date: item.time,
        count: item.operation_list.length,
        operationList: item.operation_list,
      })));
    });
  }, [databaseStatus, active]);

  return (
    <div className={styles.container}>
      <h2>数据统计</h2>
      <CalendarHeatmap
        className={styles.calendar}
        data={operationData}
        year={dayjs().format('YYYY')}
        renderTooltip={ (date, value) => {
          if (value && value.operationList.length > 0) {
            const operationList = value.operationList;
            // 按照 operation_content_type 统计
            const operationTypeMap = new Map<string, number>();
            operationList.filter(operation => operation.operation_action === 'update').forEach((item: Operation) => {
              const key = item.operation_content_type;
              if (operationTypeMap.has(key)) {
                operationTypeMap.set(key, operationTypeMap.get(key)! + 1);
              } else {
                operationTypeMap.set(key, 1);
              }
            })
            return (
              <div style={{ padding: 12 }}>
                <div>{ date }</div>
                <ul style={{ padding: '0px 24px' }}>
                  {
                    Array.from(operationTypeMap).map(([key, value]) => (
                      <li key={ key }>{ key }: { value }</li>
                    ))
                  }
                </ul>
              </div>
            )
          } else {
            return `${ date }: 操作次数0`
          }
        } }
      />
      <Row gutter={[16, 16]}>
        <Col md={24} lg={12} xxl={6}>
          <Card title={'卡片'} >
            <Row>
              <Col span={12}>
                <Statistic title={'数量'} value={cards.length} />
              </Col>
              <Col span={12}>
                <Statistic title={'总字数'} value={cardWordCounts} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col md={24} lg={12} xxl={6}>
          <Card title={'文章'}>
            <Row>
              <Col span={12}>
                <Statistic title={'数量'} value={articles.length} />
              </Col>
              <Col span={12}>
                <Statistic title={'总字数'} value={articleWordCounts} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col md={24} lg={12} xxl={6}>
          <Card title={'项目'}>
            <Row>
              <Col span={12}>
                <Statistic title={'数量'} value={projectItems.length} />
              </Col>
              <Col span={12}>
                <Statistic title={'总字数'} value={projectItemWordCounts} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col md={24} lg={12} xxl={6}>
          <Card title={'知识库'}>
            <Row>
              <Col span={12}>
                <Statistic title={'数量'} value={documentItems.length} />
              </Col>
              <Col span={12}>
                <Statistic title={'总字数'} value={documentItemWordCounts} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      <h2>最近编辑</h2>
      <Row gutter={[16, 16]} align={'stretch'}>
        <Col md={24} lg={12} xxl={6}>
          <Card title={'卡片'} style={{ height: '100%' }}>
            <div className={styles.list}>
              <For
                data={latestOperations.cards}
                renderItem={card => (
                  <Popover
                    key={card.id}
                    trigger={'hover'}
                    content={(
                      <Editor
                        readonly
                        initValue={card.content}
                        style={{
                          maxWidth: 400,
                          maxHeight: 400,
                          overflow: 'auto',
                          padding: 12
                        }}
                      />
                    )}
                  >
                    <div
                      className={styles.item}
                      key={card.id}
                      onClick={() => {
                        navigate('/cards/list');
                        onCtrlClickCard(card.id);
                      }}
                    >
                      {getEditorText(card.content, 20)}
                    </div>
                  </Popover>
                )}
              />
            </div>
          </Card>
        </Col>
        <Col md={24} lg={12} xxl={6}>
          <Card title={'文章'} style={{ height: '100%' }}>
            <div className={styles.list}>
              <For
                data={latestOperations.articles}
                renderItem={article => (
                  <Popover
                    key={article.id}
                    trigger={'hover'}
                    content={(
                      <Editor
                        readonly
                        initValue={article.content}
                        style={{
                          maxWidth: 400,
                          maxHeight: 400,
                          overflow: 'auto',
                          padding: 12
                        }}
                      />
                    )}
                  >
                    <div
                      className={styles.item}
                      key={article.id}
                      onClick={() => {
                        navigate('/articles');
                        useArticleManagementStore.setState({
                          activeArticleId: article.id,
                        });
                      }}
                    >
                      {article.title}
                    </div>
                  </Popover>
                )}
              />
            </div>
          </Card>
        </Col>
        <Col md={24} lg={12} xxl={6}>
          <Card title={'项目'} style={{ height: '100%' }}>
            <div className={styles.list}>
              <For
                data={latestOperations.projectItems}
                renderItem={projectItem => (
                  <Popover
                    key={projectItem.id}
                    trigger={'hover'}
                    content={(
                      <Editor
                        readonly
                        initValue={projectItem.content}
                        style={{
                          maxWidth: 400,
                          maxHeight: 400,
                          overflow: 'auto',
                          padding: 12
                        }}
                      />
                    )}
                  >
                    <div
                      className={styles.item}
                      key={projectItem.id}
                      onClick={() => {
                        if (projectItem.projects.length === 0) return;
                        navigate(`/projects/${projectItem.projects[0]}`)
                        useProjectsStore.setState({
                          activeProjectId: projectItem.projects[0],
                          activeProjectItemId: projectItem.id,
                        });
                      }}
                    >
                      {projectItem.title}
                    </div>
                  </Popover>
                )}
              />
            </div>
          </Card>
        </Col>
        <Col md={24} lg={12} xxl={6}>
          <Card title={'知识库'} style={{ height: '100%' }}>
            <div className={styles.list}>
              <For
                data={latestOperations.documentItems}
                renderItem={(documentItem) => (
                  <Popover
                    key={documentItem.id}
                    trigger={'hover'}
                    content={(
                      <Editor
                        readonly
                        initValue={documentItem.content}
                        style={{
                          maxWidth: 400,
                          maxHeight: 400,
                          overflow: 'auto',
                          padding: 12
                        }}
                      />
                    )}
                  >
                    <div
                      className={styles.item}
                      key={documentItem.id}
                      onClick={async () => {
                        const documents = await getRootDocumentsByDocumentItemId(documentItem.id);
                        if (documents.length === 0) return;
                        const documentId = documents[0].id;
                        navigate(`/documents/${documentId}`)
                        useDocumentsStore.setState({
                          activeDocumentItem: documentItem,
                          activeDocumentId: documentId,
                        })
                      }}
                    >
                      {documentItem.title}
                    </div>
                  </Popover>
                )}
              />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default HomeView;
