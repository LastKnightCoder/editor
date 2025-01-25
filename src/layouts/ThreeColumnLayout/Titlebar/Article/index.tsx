import TitlebarIcon from "@/components/TitlebarIcon";
import FocusMode from "../../../../components/FocusMode";

import { PlusOutlined } from '@ant-design/icons';
import useArticleManagementStore from "@/stores/useArticleManagementStore";

import styles from './index.module.less';
import { useMemoizedFn } from "ahooks";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

const Article = () => {
  const { createArticle } = useArticleManagementStore(state => ({
    activeArticleId: state.activeArticleId,
    createArticle: state.createArticle,
  }))

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

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={handleAddNewArticle} tip={'新建文章'}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
    </div>
  )
}

export default Article;