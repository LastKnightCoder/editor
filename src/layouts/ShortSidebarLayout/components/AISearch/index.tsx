import { useEffect, memo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import isHotkey from "is-hotkey";
import Editor from '@/components/Editor';

import {  useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useCardManagement from "@/hooks/useCardManagement.ts";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import "@tmikeladze/react-cmdk/dist/cmdk.css";
import { Empty, Tag } from "antd";
import styles from './index.module.less';
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import { VecDocument } from "@/types";
import classnames from "classnames";
import { LoadingOutlined, SearchOutlined } from "@ant-design/icons";
import EditText, { EditTextHandle } from "@/components/EditText";
import If from "@/components/If";
import For from "@/components/For";
import useArticleManagementStore from "@/stores/useArticleManagementStore";

const AISearch = memo(() => {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<Array<[VecDocument, number]>>([]);
  const searchRef = useRef<EditTextHandle>(null);
  const lastSearchText = useRef('');

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }));
  const {
    articles
  } = useArticleManagementStore(state => ({
    articles: state.articles
  }));

  const {
    open,
    onSearch
  } = useCommandPanelStore(state => ({
    open: state.open,
    onSearch: state.onSearch
  }));

  const {
    onCtrlClickCard,
  } = useCardManagement();

  const onClickMask = useMemoizedFn(() => {
    useCommandPanelStore.setState({ open: false });
  });

  const onPressEnter = async () => {
    const searchText = searchRef.current?.getValue();
    if (!searchText) {
      return;
    }
    setSearchLoading(true);
    try {
      const res = await onSearch(searchText);
      setSearchResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setSearchLoading(false);
    }
    searchRef.current?.focusEnd();
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+k', e)) {
        e.preventDefault();
        useCommandPanelStore.setState({ open: true });
      } else if (isHotkey('esc', e) && open) {
        useCommandPanelStore.setState({
          open: false,
        });
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const uniqueSearchResult = searchResult.reduce((acc, cur) => {
    if (!acc.find(item => item[0].refId === cur[0].refId && item[0].refType === cur[0].refType)) {
      acc.push(cur);
    }
    return acc;
  }, [] as Array<[VecDocument, number]>);

  if (!open) return null;

  return (
    <div className={styles.commandContainer}>
      <div className={classnames(styles.mask, { [styles.dark]: isDark })} onClick={onClickMask} />
      <div className={classnames(styles.panel, { [styles.dark]: isDark })}>
        <div className={styles.searchHeader}>
          <div className={styles.searchIcon}>
            { searchLoading ? <LoadingOutlined /> : <SearchOutlined />}
          </div>
          <EditText
            ref={searchRef}
            className={styles.search}
            onPressEnter={onPressEnter}
            onDeleteEmpty={() => {
              setSearchResult([]);
              useCommandPanelStore.setState({ open: false });
            }}
            contentEditable
            defaultFocus
            defaultValue={lastSearchText.current || ''}
            onChange={(value) => {
              lastSearchText.current = value;
              if (!value) {
                setSearchResult([]);
              }
            }}
          />
        </div>
        <div className={styles.resultContainer}>
          <If condition={searchLoading}>
            <div className={styles.loadingContainer}>
              <LoadingOutlined />
            </div>
          </If>
          <If condition={!searchLoading}>
            <If condition={uniqueSearchResult.length === 0}>
              <Empty
                style={{
                  padding: 24
                }}
                description={'暂无数据'}
              />
            </If>
            <If condition={uniqueSearchResult.length > 0}>
              <div className={styles.list}>
                <For
                  data={uniqueSearchResult}
                  renderItem={res => {
                    const initValue = (() => {
                      if (res[0].refType === 'card') {
                        return cards.find(item => item.id === res[0].refId)?.content || [];
                      } else if (res[0].refType === 'article') {
                        return articles.find(item => item.id === res[0].refId)?.content || [];
                      }
                    })()
                    return (
                      <div
                        className={styles.item}
                        key={res[0].id}
                        onClick={() => {
                          useCommandPanelStore.setState({ open: false });
                          if (res[0].refType === 'card') {
                            navigate('/cards/list');
                            onCtrlClickCard(res[0].refId);
                          } else if (res[0].refType === 'article') {
                            navigate('/articles');
                            useArticleManagementStore.setState({
                              activeArticleId: res[0].refId,
                            });
                          }
                        }}
                      >
                        <Tag color="pink" style={{ marginBottom: 12 }}>{ res[0].refType }</Tag>
                        <Editor
                          style={{
                            maxHeight: 160,
                            overflowY: 'hidden',
                          }}
                          initValue={initValue}
                        />
                      </div>
                    )
                  }}
                />
              </div>
            </If>
          </If>
        </div>
      </div>
    </div>
  );
});

export default AISearch;
