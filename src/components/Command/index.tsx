import "react-cmdk/dist/cmdk.css";
import CommandPalette, { filterItems, getItemIndex } from "react-cmdk";
import { useEffect, useState } from "react";
import isHotkey from "is-hotkey";
import { useSlate } from "slate-react";
import {
  insertCallout,
  insertCodeBlock,
  insertGraphviz,
  insertImage,
  insertTable,
  insertTikz,
  insertBlockMath,
  insertBulletList,
  insertCheckList,
  insertNumberedList,
  insertDetails,
  insertMermaid
} from "../../utils";


const Command = () => {
  const editor = useSlate();
  const [open, setOpen] = useState<boolean>(false);
  const [search, setSearch] = useState("");

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
  }, [])

  const filteredItems = filterItems(
    [
      {
        heading: "新增命令",
        id: "insert",
        items: [
          {
            id: "table",
            children: "插入表格",
            onClick: () => {
              insertTable(editor, 2, 4);
            }
          },
          {
            id: "code-block",
            children: "插入代码块",
            keywords: ['code'],
            closeOnSelect: true,
            onClick: () => {
              insertCodeBlock(editor);
            }
          },
          {
            id: "block-math",
            children: "插入块级公式",
            keywords: ['math'],
            closeOnSelect: true,
            onClick: () => {
              insertBlockMath(editor);
            }
          },
          {
            id: 'image',
            children: '插入图片',
            keywords: ['image'],
            onClick: () => {
              insertImage(editor, { url: '' });
            }
          },
        ],
      },
      {
        heading: '列表',
        id: 'list',
        items: [{
          id: 'bulleted-list',
          children: '无序列表',
          keywords: ['ul'],
          onClick: () => {
            insertBulletList(editor);
          }
        }, {
          id: 'numbered-list',
          children: '有序列表',
          keywords: ['ol'],
          onClick: () => {
            insertNumberedList(editor);
          }
        }, {
          id: 'check-list',
          children: '任务列表',
          keywords: ['check', 'todo'],
          onClick: () => {
            insertCheckList(editor);
          }
        }]
      },
      {
        heading: '高亮快',
        id: 'callout',
        items: [{
          id: 'callout-tip',
          children: '提示',
          keywords: ['tip'],
          onClick: () => {
            insertCallout(editor, 'tip');
          }
        }, {
          id: 'callout-note',
          children: '注意',
          keywords: ['note'],
          onClick: () => {
            insertCallout(editor, 'note');
          }
        }, {
          id: 'callout-info',
          children: '信息',
          keywords: ['info'],
          onClick: () => {
            insertCallout(editor, 'info');
          }
        }, {
          id: 'callout-warning',
          children: '警告',
          keywords: ['warning'],
          onClick: () => {
            insertCallout(editor, 'warning');
          }
        }, {
          id: 'callout-danger',
          children: '危险',
          keywords: ['danger'],
          onClick: () => {
            insertCallout(editor, 'danger');
          }
        }, {
          id: 'detail',
          children: '详情',
          keywords: ['detail'],
          onClick: () => {
            insertDetails(editor);
          }
        }]
      },
      {
        heading: '图表',
        id: 'chart',
        items: [{
          id: 'mermaid',
          children: 'Mermaid',
          keywords: ['mermaid'],
          onClick: () => {
            insertMermaid(editor);
          }
        }, {
          id: 'tikz',
          children: 'Tikz',
          keywords: ['tikz'],
          onClick: () => {
            insertTikz(editor);
          }
        }, {
          id: 'graphviz',
          children: 'Graphviz',
          keywords: ['graphviz'],
          onClick: () => {
            insertGraphviz(editor);
          }
        }]
      }
    ],
    search
  );

  return (
    <CommandPalette
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
  );
}

export default Command;