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
  width: 52,
  height: 60,
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
    connection: [0.5, 0.5],
    bindId: '1',
  },
  target: {
    marker: 'arrow',
    connection: [0.5, 0],
    bindId: '2',
  },
  points: [
    {x: 400, y: 300},
    {x: 350, y: 100},
  ],
  lineColor: '#1871c2',
  lineWidth: 2,
}]