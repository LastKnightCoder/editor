import {IBlockPanelListItem} from "../types/blockPanel.ts";
import {
  insertHeader,
  insertCallout,
  insertCodeBlock,
  insertBlockMath,
  insertTable,
  insertMermaid,
  insertBulletList,
  insertCheckList,
  insertImage, insertNumberedList
} from "../utils";
import {Editor} from "slate";

const generateHeader = (): IBlockPanelListItem[] => {
  return ([1, 2, 3, 4, 5, 6] as const).map(level => {
    return {
      icon: 'h' + level,
      title: '标题' + level,
      keywords: ['h' + level, '标题' + level],
      description: '标题' + level,
      onClick: (editor: Editor) => {
        insertHeader(editor, level);
      }
    }
  })
}

export const blockPanelList: IBlockPanelListItem[] = [...generateHeader(), {
  icon: 'callout',
  title: '提示',
  keywords: ['callout', '提示', 'tip'],
  description: '提示',
  onClick: (editor) => {
    insertCallout(editor, 'tip');
  }
}, {
  icon: 'callout',
  title: '信息',
  keywords: ['callout', '信息', 'info'],
  description: '信息',
  onClick: (editor) => {
    insertCallout(editor, 'info');
  }
}, {
  icon: 'callout',
  title: '笔记',
  keywords: ['callout', '笔记', 'note'],
  description: '笔记',
  onClick: (editor) => {
    insertCallout(editor, 'note');
  }
}, {
  icon: 'callout',
  title: '危险',
  keywords: ['callout', '危险', 'danger'],
  description: '危险',
  onClick: (editor) => {
    insertCallout(editor, 'danger');
  }
}, {
  icon: 'callout',
  title: '警告',
  keywords: ['callout', '警告', 'warning'],
  description: '警告',
  onClick: (editor) => {
    insertCallout(editor, 'warning');
  }
}, {
  icon: 'codeblock',
  title: '代码块',
  keywords: ['codeblock', '代码块'],
  description: '代码块',
  onClick: (editor) => {
    insertCodeBlock(editor);
  }
}, {
  icon: 'math',
  title: '数学公式',
  keywords: ['math', '数学公式'],
  description: '数学公式',
  onClick: (editor) => {
    insertBlockMath(editor);
  }
}, {
  icon: 'table',
  title: '表格',
  keywords: ['table', '表格'],
  description: '表格',
  onClick: (editor) => {
    insertTable(editor, 3, 3);
  }
}, {
  icon: 'mermaid',
  title: '流程图',
  keywords: ['mermaid', '流程图'],
  description: '流程图',
  onClick: (editor) => {
    insertMermaid(editor);
  }
}, {
  icon: 'bulleted-list',
  title: '无序列表',
  keywords: ['bulleted-list', '列表'],
  description: '无序列表',
  onClick: (editor) => {
    insertBulletList(editor);
  }
}, {
  icon: 'numbered-list',
  title: '有序列表',
  keywords: ['numbered-list', '列表'],
  description: '有序列表',
  onClick: (editor) => {
    insertNumberedList(editor);
  }
}, {
  icon: 'check-list',
  title: '任务列表',
  keywords: ['check-list', '列表'],
  description: '任务列表',
  onClick: (editor) => {
    insertCheckList(editor);
  }
}, {
  icon: 'image',
  title: '图片',
  keywords: ['image', '图片'],
  description: '图片',
  onClick: (editor) => {
    insertImage(editor, {
      url: ''
    })
  }
}];