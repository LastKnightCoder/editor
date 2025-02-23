import { BoardElement } from './types';
import { v4 as uuid } from 'uuid';

const root: BoardElement[] = [{
  type: 'mind-node',
  id: uuid(),
  x: 0,
  y: 0,
  width: 100,
  height: 30,
  actualHeight: 0,
  background: '#fff',
  border: '#aaa',
  text: [{
    type: "paragraph",
    children: [{
      type: "formatted",
      text: "根节点"
    }]
  }],
  textColor: '#000',
  direction: 'right',
  childrenHeight: 0,
  level: 1,
  children: [{
    type: 'mind-node',
    id: uuid(),
    x: 40,
    y: 30,
    width: 100,
    height: 30,
    actualHeight: 0,
    background: '#fff',
    border: '#aaa',
    text: [{
      type: "paragraph",
      children: [{
        type: "formatted",
        text: "子节点1"
      }]
    }],
    textColor: '#000',
    direction: 'right',
    childrenHeight: 0,
    level: 2,
    children: [{
      type: 'mind-node',
      id: uuid(),
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      actualHeight: 0,
      background: '#fff',
      border: '#aaa',
      text: [{
        type: "paragraph",
        children: [{
          type: "formatted",
          text: "子节点"
        }]
      }],
      textColor: '#000',
      direction: 'right',
      childrenHeight: 0,
      level: 2,
      children: []
    }, {
      type: 'mind-node',
      id: uuid(),
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      actualHeight: 0,
      background: '#fff',
      border: '#aaa',
      text: [{
        type: "paragraph",
        children: [{
          type: "formatted",
          text: "子节点"
        }]
      }],
      textColor: '#000',
      direction: 'right',
      childrenHeight: 0,
      level: 2,
      children: []
    }, {
      type: 'mind-node',
      id: uuid(),
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      actualHeight: 0,
      background: '#fff',
      border: '#aaa',
      text: [{
        type: "paragraph",
        children: [{
          type: "formatted",
          text: "子节点"
        }]
      }],
      textColor: '#000',
      direction: 'right',
      childrenHeight: 0,
      level: 2,
      children: []
    }]
  }, {
    type: 'mind-node',
    id: uuid(),
    x: 10,
    y: 10,
    width: 100,
    height: 30,
    actualHeight: 0,
    background: 'red',
    border: '#ccc',
    text: [{
      type: "paragraph",
      children: [{
        type: "formatted",
        text: "子节点2"
      }]
    }],
    textColor: '#000',
    direction: 'right',
    childrenHeight: 0,
    level: 2,
    children: [{
      type: 'mind-node',
      id: uuid(),
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      actualHeight: 0,
      background: '#fff',
      border: '#aaa',
      text: [{
        type: "paragraph",
        children: [{
          type: "formatted",
          text: "子节点"
        }]
      }],
      textColor: '#000',
      direction: 'right',
      childrenHeight: 0,
      level: 2,
      children: []
    }, {
      type: 'mind-node',
      id: uuid(),
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      actualHeight: 0,
      background: '#fff',
      border: '#aaa',
      text: [{
        type: "paragraph",
        children: [{
          type: "formatted",
          text: "子节点"
        }]
      }],
      textColor: '#000',
      direction: 'right',
      childrenHeight: 0,
      level: 2,
      children: []
    }, {
      type: 'mind-node',
      id: uuid(),
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      actualHeight: 0,
      background: '#fff',
      border: '#aaa',
      text: [{
        type: "paragraph",
        children: [{
          type: "formatted",
          text: "子节点"
        }]
      }],
      textColor: '#000',
      direction: 'right',
      childrenHeight: 0,
      level: 2,
      children: []
    }]
  }]
}]


export default root;
