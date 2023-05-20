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
  }, {
    type: 'inline-math',
    tex: 'x^2 + y^2 = z^2',
    children: [{
      type: 'formatted',
      text: ''
    }]
  }]
}, {
  type: 'block-math',
  tex: 'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x < 0 \\end{cases}',
  children: [{
    type: 'formatted',
    text: ''
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
  type: 'check-list',
  children: [{
    type: 'check-list-item',
    checked: true,
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '这是一个 demo1'
      }]
    }]
  }, {
    type: 'check-list-item',
    checked: false,
    children: [{
      type: 'paragraph',
      children: [{
        type: 'formatted',
        text: '这是一个 demo'
      }]
    }]
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
}, {
  type: 'table',
  children: [{
    type: 'table-row',
    children: [{
      type: 'table-cell',
      children: [{
        type: 'formatted',
        text: '这是一个 Table demo 1'
      }]
    }, {
      type: 'table-cell',
      children: [{
        type: 'formatted',
        text: '这是一个 Table demo 2'
      }]
    }]
  }, {
    type: 'table-row',
    children: [{
      type: 'table-cell',
      children: [{
        type: 'formatted',
        text: '这是一个 Table demo 3'
      }]
    }, {
      type: 'table-cell',
      children: [{
        type: 'formatted',
        text: '这是一个 Table demo 4'
      }]
    }]
  }]
}, {
  type: 'mermaid',
  chart: 'graph LR\n' +
    'A[Christmas] -->|Get money| B(Go shopping)\n' +
    'B --> C{Let me think}\n' +
    'C -->|One| D[Laptop]\n' +
    'C -->|Two| E[iPhone]\n' +
    'C -->|Three| F[fa:fa-car Car]\n' +
    'C -->|Four| G[fa:fa-home Laptop]\n' +
    'C -->|Five| H[fa:fa-motorcycle Phone]',
  children: [{
    type: 'formatted',
    text: ''
  }]
}];