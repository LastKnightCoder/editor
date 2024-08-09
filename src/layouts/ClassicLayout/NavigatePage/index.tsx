import { useEffect, useState } from "react";
import isHotkey from "is-hotkey";
import CommandPalette, { filterItems, getItemIndex } from "@tmikeladze/react-cmdk";
import { useNavigate } from "react-router-dom";
import useTheme from "@/hooks/useTheme.ts";
import "@tmikeladze/react-cmdk/dist/cmdk.css";

const NavigatePage = () => {
  const [open, setOpen] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { isDark } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isHotkey('mod+k', event)) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(open => !open);
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, []);

  const filteredItems = filterItems(
    [
      {
        heading: "跳转页面",
        id: "navigate-page",
        items: [
          {
            id: "card-list",
            children: "卡片列表",
            keywords: ['card', '卡片'],
            onClick: () => {
              navigate('/cards/list');
            }
          },
          {
            id: "article-list",
            children: "文章列表",
            keywords: ['article', '文章'],
            closeOnSelect: true,
            onClick: () => {
              navigate('/articles/list');
            }
          },
          {
            id: "document-list",
            children: "文档",
            keywords: ['document', '文档'],
            closeOnSelect: true,
            onClick: () => {
              navigate('/documents');
            }
          },
          {
            id: 'daily-note',
            children: '日记',
            keywords: ['daily', '日记'],
            closeOnSelect: true,
            onClick: () => {
              navigate('/daily');
            }
          },
          {
            id: 'statistic',
            children: '统计',
            keywords: ['statistic', '统计'],
            closeOnSelect: true,
            onClick: () => {
              navigate('/statistic');
            }
          },
          {
            id: 'time-record',
            children: '时间记录',
            keywords: ['time', '时间'],
            closeOnSelect: true,
            onClick: () => {
              navigate('/time-record');
            }
          },
          {
            id: 'pdf-demo',
            children: 'PDF Demo',
            keywords: ['pdf', 'PDF'],
            closeOnSelect: true,
            onClick: () => {
              navigate('/pdf-demo');
            }
          }
        ],
      },
    ],
    search
  );

  return (
    <CommandPalette
      commandPaletteContentClassName={ isDark ? 'dark' : '' }
      onChangeSearch={setSearch}
      onChangeOpen={setOpen}
      search={search}
      isOpen={open}
    >
      {filteredItems.length ? (
        filteredItems.map((list) => (
          <CommandPalette.List key={list.id} heading={list.heading}>
            {list.items.map(({ id, ...rest }) => (
              <CommandPalette.ListItem
                key={id}
                index={getItemIndex(filteredItems, id)}
                {...rest}
              />
            ))}
          </CommandPalette.List>
        ))
      ) : (
        <CommandPalette.FreeSearchAction />
      )}
    </CommandPalette>
  )
}

export default NavigatePage;
