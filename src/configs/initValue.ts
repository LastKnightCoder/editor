import {Descendant} from "slate";
import {v4 as getUuid} from "uuid";

export const initValue: Descendant[] = [{
  type: 'image',
  url: 'https://cdn.staticaly.com/gh/LastKnightCoder/image-for-2022@master/w1.4zmfy9joggg0.webp',
  alt: '',
  children: [{
    type: 'formatted',
    text: ''
  }]
}, {
  type: 'blockquote',
  children: [{
    type: 'paragraph',
    children: [{
      type: 'formatted',
      text: 'blockquote demo 哈哈哈哈'
    }]
  }]
}, {
  type: 'detail',
  children: [{
    type: 'paragraph',
    children: [{
      type: 'formatted',
      text: '这是一个 demo'
    }]
  }]
}, {
  type: 'paragraph',
  children: [{
    type: 'formatted',
    text: '这是一个 demo'
  }, {
    type: 'link',
    url: 'https://www.bilibili.com',
    children: [{
      type: 'formatted',
      text: 'bilibili'
    }]
  }]
}, {
  type: 'code-block',
  language: 'javascript',
  code: 'console.log("hello world")',
  uuid: getUuid(),
  children: [{
    type: 'formatted',
    text: ''
  }]
}, {
  type: 'paragraph',
  children: [{
    type: 'formatted',
    text: '这是一个 demo'
  }, {
    type: 'formatted',
    text: '加粗',
    bold: true
  }, {
    type: 'formatted',
    text: '斜体',
    italic: true
  }, {
    type: 'formatted',
    text: '下划线',
    underline: true
  }, {
    type: 'formatted',
    text: '高亮',
    highlight: true
  }]
}, {
  type: 'callout',
  calloutType: 'info',
  children: [{
    type: 'paragraph',
    children: [{
      type: 'formatted',
      text: '这是一个 demo'
    }]
  }]
}, {
  type: 'bulleted-list',
  children: [{
    type: 'list-item',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '这是一个 List demo 2'
      }]
    }]
  }, {
    type: 'list-item',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '这是一个 List demo 2'
      }]
    }]
  }]
}, {
  type: 'numbered-list',
  children: [{
    type: 'list-item',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '这是一个 List demo 2'
      }]
    }]
  }, {
    type: 'list-item',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '这是一个 List demo 2'
      }]
    }]
  }]
}, {
  type: 'image',
  url: 'https://cdn.staticaly.com/gh/LastKnightCoder/image-for-2022@master/image.2xx8cqgylu00.png',
  alt: '',
  children: [{
    type: 'formatted',
    text: ''
  }]
}, {
  type: 'image',
  url: '',
  alt: '',
  children: [{
    type: 'formatted',
    text: ''
  }]
}];