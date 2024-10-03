import { v4 as getUuid } from 'uuid';

export const mockData = [{
  id: '1',
  type: 'card',
  x: 200,
  y: 200,
  width: 400,
  height: 200,
  maxWidth: 400,
  maxHeight: 1000,
  cardId: 200,
  resized: false,
  readonly: false,
  borderWidth: 1,
  borderColor: '#7a7374',
  paddingWidth: 24,
  paddingHeight: 24,
}, {
  id: '2',
  type: 'geometry',
  x: 300,
  y: 300,
  width: 100,
  height: 100,
  paths: ['M 0 0 L 1 0 L 1 1 L 0 1 Z'],
  fill: '#7a7374',
  fillOpacity: 0.5,
  stroke: 'black',
  strokeWidth: 2
}, {
  id: getUuid(),
  type: 'geometry',
  x: 100,
  y: 100,
  width: 100,
  height: 100,
  paths: ['M 1,0.5 A 0.5,0.5 0 1,0 0,0.5 A 0.5,0.5 0 1,0 1,0.5', 'M 0 0 L 1 0 L 1 1 L 0 1 Z'],
  fill: 'none',
  stroke: 'red',
  strokeWidth: 2
}, {
  id: getUuid(),
  type: 'richtext',
  x: 400,
  y: 600,
  width: 33,
  height: 42,
  maxWidth: 300,
  maxHeight: 1000,
  readonly: false,
  content: [{
    type: 'paragraph',
    children: [{
      type: 'formatted',
      text: '',
    }]
  }],
  borderWidth: 2,
  borderColor: '#ed556a',
  paddingWidth: 16,
  paddingHeight: 8,
}, {
  id: getUuid(),
  type: 'arrow',
  lineType: 'straight',
  source: {
    marker: 'none',
    connectId: 'left',
    bindId: '1',
  },
  target: {
    marker: 'arrow',
    connectId: 'top',
    bindId: '2',
  },
  points: [
    {x: 400, y: 300},
    {x: 350, y: 100},
  ],
  lineColor: '#1871c2',
  lineWidth: 2,
}, {
  id: getUuid(),
  type: 'arrow',
  lineType: 'straight',
  source: {
    marker: 'none',
  },
  target: {
    marker: 'arrow',
  },
  points: [
    {x: 300, y: 300},
    {x: 400, y: 600},
  ],
  lineColor: '#2b1216',
  lineWidth: 2,
}, {
  id: getUuid(),
  type: 'image',
  x: 500,
  y: 500,
  width: 100,
  height: 100,
  src: 'https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-281d5y_0ee0d318-9208-403f-9a79-cce4b9424898.png',
  preserveAspectRatio: 'xMidYMid slice'
}]