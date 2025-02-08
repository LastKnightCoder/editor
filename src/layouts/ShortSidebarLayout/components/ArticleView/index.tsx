import { FloatButton } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";

import ArticleList from "@/layouts/components/ArticleList";
import SimpleArticleList from "./SimpleArticleList";

import EditArticle from '@/layouts/components/EditArticle';
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import styles from './index.module.less';

const ArticleView = () => {
  const {
    activeArticleId,
    createArticle,
    hideArticleList
  } = useArticleManagementStore(state => ({
    activeArticleId: state.activeArticleId,
    createArticle: state.createArticle,
    hideArticleList: state.hideArticleList
  }));

  const handleAddNewArticle = useMemoizedFn(async () => {
    const article = await createArticle({
      title: '默认文章标题',
      content: DEFAULT_ARTICLE_CONTENT,
      bannerBg: '',
      isTop: false,
      author: '',
      links: [],
      tags: [],
      isDelete: false,
    });
    useArticleManagementStore.setState({
      activeArticleId: article.id,
    });
  });

  const isShowEdit = !!activeArticleId;

  return (
    <div className={classnames(styles.viewContainer, { [styles.showEdit]: isShowEdit, [styles.hideArticleList]: hideArticleList })}>
      {
        !activeArticleId && (
          <ArticleList className={styles.listContainer} />
        )
      }
      {
        activeArticleId && (
          <SimpleArticleList className={styles.simpleListContainer} />
        )
      }
      <div className={styles.editContainer}>
        {
          isShowEdit && (
            <EditArticle key={activeArticleId} />
          )
        }
      </div>
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={'新建文章'}
        onClick={handleAddNewArticle}
      />
    </div>
  )
}

export default ArticleView;
