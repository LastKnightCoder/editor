import { useEffect, memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CommandPalette from "@tmikeladze/react-cmdk";
import isHotkey from "is-hotkey";
import Editor from '@/components/Editor';

import { useDebounceFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useCardManagement from "@/hooks/useCardManagement.ts";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import "@tmikeladze/react-cmdk/dist/cmdk.css";
import { Empty, Flex } from "antd";
import styles from './index.module.less';
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import { VecDocument } from "@/types";
import classnames from "classnames";

const AISearch = memo(() => {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [searchLoading, setSearchLoading] = useState(false);

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }))

  const {
    open,
    input,
    searchResult,
    onSearch
  } = useCommandPanelStore(state => ({
    open: state.open,
    input: state.input,
    searchResult: state.searchResult,
    onSearch: state.onSearch
  }));

  const {
    onCtrlClickCard,
  } = useCardManagement();

  const { run: search } = useDebounceFn((input: string) => {
    if (searchLoading) return;
    setSearchLoading(true);
    onSearch(input).finally(() => {
      setSearchLoading(false);
    })
  }, { wait: 1500 });

  useEffect(() => {
    if (input === '') {
      useCommandPanelStore.setState({
        searchResult: []
      });
      return;
    }
    search(input);
  }, [input, search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+k', e)) {
        e.preventDefault();
        useCommandPanelStore.setState({ open: true });
      } else if (isHotkey('esc', e) && open) {
        useCommandPanelStore.setState({
          open: false,
          input: '',
          searchResult: []
        });
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const uniqueSearchResult = searchResult.reduce((acc, cur) => {
    if (!acc.find(item => item[0].refId === cur[0].refId)) {
      acc.push(cur);
    }
    return acc;
  }, [] as Array<[VecDocument, number]>)

  return (
    <CommandPalette
      commandPaletteContentClassName={isDark ? 'dark' : ''}
      isOpen={open}
      search={input}
      onChangeOpen={open => { useCommandPanelStore.setState({ open }) }}
      onChangeSearch={input => { useCommandPanelStore.setState({ input }) }}
      placeholder="搜索"
    >
      {
        searchLoading ? (
          <Flex align={'center'} justify={'center'} style={{ height: 80 }}>
            <div className={classnames(styles.loader, { [styles.dark]: isDark })}></div>
          </Flex>
        ) : (
          uniqueSearchResult.length > 0 ? (
            uniqueSearchResult.map((res, index) => (
              <CommandPalette.ListItem
                key={res[0].id}
                index={index}
                onClick={() => {
                  useCommandPanelStore.setState({ open: false });
                  navigate('/cards/list');
                  onCtrlClickCard(res[0].refId);
                }}
                closeOnSelect
                showType={false}
              >
                <Editor
                  style={{
                    padding: 24,
                    maxHeight: 160,
                    overflowY: 'auto',
                  }}
                  initValue={cards.find(item => item.id === res[0].refId)?.content || []}
                />
              </CommandPalette.ListItem>
            ))
          ) : (
            <Empty
              style={{
                padding:24
              }}
              description={'暂无数据'}
            />
          )
        )
      }
    </CommandPalette>
  )
});

export default AISearch;
