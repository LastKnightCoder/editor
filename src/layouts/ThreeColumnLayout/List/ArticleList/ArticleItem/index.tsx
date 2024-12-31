import { memo, useState, useRef } from 'react';
import { Typography, Popover, App, Modal, Spin, Flex } from 'antd';
import classnames from "classnames";
import useUploadImage from '@/hooks/useUploadImage';

// import Tags from "@/components/Tags";
import LocalImage from "@/components/LocalImage";
import useArticleManagementStore from "@/stores/useArticleManagementStore";

import { MdMoreVert } from 'react-icons/md';
import { formatDate, getEditorTextValue } from "@/utils";
import { IArticle } from "@/types";

import styles from './index.module.less';
import { useMemoizedFn } from 'ahooks';
import Tags from "@/components/Tags";

interface IArticleItemProps {
  article: IArticle;
  disableOperation?: boolean;
}

const { Paragraph } = Typography;

const ArticleItem = memo((props: IArticleItemProps) => {
  const { article, disableOperation } = props;

  const [bannerUploading, setBannerUploading] = useState(false);
  const [settingOpen, setSettingOpen] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const uploadImage = useUploadImage();
  const { message } = App.useApp();

  const {
    updateArticleIsTop,
    deleteArticle,
    updateArticleBannerBg,
    activeArticleId
  } = useArticleManagementStore((state) => ({
    updateArticleIsTop: state.updateArticleIsTop,
    deleteArticle: state.deleteArticle,
    updateArticleBannerBg: state.updateArticleBannerBg,
    activeArticleId: state.activeArticleId
  }));

  const isActive = activeArticleId === article.id;

  const handleUploadFileChange = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
    setBannerUploading(true);
    const files = event.target.files;
    if (!files) {
      setBannerUploading(false);
      return;
    }
    const file = files[0];
    if (file.size > 1024 * 1024 * 5) {
      message.error('文件大小超过5M');
      setBannerUploading(false);
      return;
    }
    const url = await uploadImage(file);
    if (!url) {
      message.error('上传失败');
      setBannerUploading(false);
      return;
    }
    updateArticleBannerBg?.(article.id, url || '');
    setBannerUploading(false);
  })

  const handleDeleteArticle = useMemoizedFn(() => {
    Modal.confirm({
      title: '确定删除该文章？',
      onOk: () => {
        deleteArticle(article.id);
      },
      okText: '确定',
      cancelText: '取消',
    });
    setSettingOpen(false);
  })

  const handleClickArticle = useMemoizedFn(() => {
    if (article.id === activeArticleId) {
      useArticleManagementStore.setState({
        activeArticleId: undefined
      });
      return;
    }
    useArticleManagementStore.setState({
      activeArticleId: article.id
    });
  })

  return (
    <div
      className={
        classnames(
          styles.articleItem,
          { [styles.active]: isActive }
        )
      }
      onClick={handleClickArticle}
    >
      {
        !disableOperation && (
          <div className={styles.operate} onClick={e => e.stopPropagation()}>
            <Popover
              open={settingOpen}
              onOpenChange={setSettingOpen}
              placement={'bottomRight'}
              trigger={'click'}
              overlayInnerStyle={{
                padding: 4,
              }}
              content={(
                <div className={styles.settings}>
                  <div
                    className={styles.settingItem}
                    onClick={() => {
                      updateArticleIsTop(article.id, !article.isTop);
                      setSettingOpen(false)
                    }}
                  >
                    {article.isTop ? '取消置顶' : '置顶文章'}
                  </div>
                  <div
                    className={styles.settingItem}
                    onClick={handleDeleteArticle}
                  >
                    删除文章
                  </div>
                  <div
                    className={styles.settingItem}
                    onClick={() => {
                      setSettingOpen(false);
                      fileUploadRef.current?.click();
                    }}
                  >
                    换背景图
                  </div>
                  <input
                    ref={fileUploadRef}
                    type={'file'}
                    accept={'image/*'}
                    style={{ display: 'none' }}
                    onChange={handleUploadFileChange}
                  />
                </div>
              )}
            >
              <MdMoreVert/>
            </Popover>
          </div>
        )
      }
      <div className={styles.time}>
        创建于：{formatDate(article.create_time, true)}
      </div>
      <Flex align={'center'}>
        <Flex vertical gap={'small'} className={styles.contentContainer}>
          <div className={styles.title}>
            {article.title}
          </div>
          <div className={styles.content}>
            <Paragraph ellipsis={{ rows: 2 }}>
              {getEditorTextValue(article.content)}
            </Paragraph>
          </div>
        </Flex>
        <Spin spinning={bannerUploading}>
          <LocalImage
            className={styles.img}
            url={article.bannerBg || 'https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png'}
          />
        </Spin>
      </Flex>
      <div className={styles.tags}>
        <Tags tags={article.tags} showIcon tagStyle={isActive ? { backgroundColor: 'var(--active-icon-bg)' } : {}}/>
      </div>
    </div>
  )
});

export default ArticleItem;
