import styles from './index.module.less';
import { GeometryElement } from "@/components/WhiteBoard/plugins";
import { Popover, Tooltip } from "antd";
import { BsBorderWidth } from "react-icons/bs";

import {
  MdOutlineFormatAlignJustify,
  MdOutlineFormatAlignLeft,
  MdOutlineFormatAlignRight,
  MdOutlineFormatAlignCenter
} from "react-icons/md";
import { BiSolidColorFill } from "react-icons/bi";
import { produce } from 'immer';
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";

interface GeometrySetterProps {
  element: GeometryElement;
  onChange: (element: GeometryElement) => void;
}

interface ColorOption {
  fill: string;
  stroke: string;
  color: string;
}

const strokeWidthOptions = [
  { label: '1px', value: 1 },
  { label: '2px', value: 2 },
  { label: '3px', value: 3 },
  { label: '4px', value: 4 },
  { label: '5px', value: 5 },
  { label: '6px', value: 6 },
  { label: '7px', value: 7 },
  { label: '8px', value: 8 },
  { label: '9px', value: 9 },
]

const colors: ColorOption[] = [{
  fill: '#FF585D',
  stroke: 'transparent',
  color: '#fff'
}, {
  fill: '#24B079',
  stroke: 'transparent',
  color: '#fff'
}, {
  fill: '#865CC2',
  stroke: 'transparent',
  color: '#fff'
}, {
  fill: '#3F71FB',
  stroke: 'transparent',
  color: '#fff'
}, {
  fill: '#f4d63b',
  stroke: 'transparent',
  color: '#fff'
}, {
  fill: '#fff',
  stroke: '#FF585D',
  color: '#FF585D'
}, {
  fill: '#fff',
  stroke: '#24B079',
  color: '#24B079'
}, {
  fill: '#fff',
  stroke: '#865CC2',
  color: '#865CC2'
}, {
  fill: '#fff',
  stroke: '#3F71FB',
  color: '#3F71FB'
}, {
  fill: '#fff',
  stroke: '#f4d63b',
  color: '#f4d63b'
}];

const alignOptions = [{
  value: 'left',
  icon: <MdOutlineFormatAlignLeft />
}, {
  value: 'center',
  icon: <MdOutlineFormatAlignCenter />
}, {
  value: 'right',
  icon: <MdOutlineFormatAlignRight />
}] as const;

const GeometrySetter = (props: GeometrySetterProps) => {
  const { element, onChange } = props;
  
  const handleOnSelectColor = useMemoizedFn((color: ColorOption) => {
    const newElement = produce(element, draft => {
      draft.stroke = color.stroke;
      draft.strokeOpacity = 1;
      draft.fill = color.fill;
      draft.fillOpacity = 1;
      draft.color = color.color;
    });
    onChange(newElement);
  })
  
  const handleOnSelectStrokeWidth = useMemoizedFn((value: number) => {
    const newElement = produce(element, draft => {
      draft.strokeWidth = value;
    });
    onChange(newElement);
  });
  
  const handleOnSelectAlign = useMemoizedFn((value: 'left' | 'center' | 'right') => {
    const newElement = produce(element, draft => {
      draft.text.align = value;
    });
    onChange(newElement);
  })
  
  return (
    <div
      className={styles.container}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
    >
      <Popover
        arrow={false}
        trigger={'click'}
        placement={'right'}
        styles={{
          body: {
            marginLeft: 24,
          },
        }}
        content={(
          <div className={styles.colorSelect}>
            {
              colors.map((color) => {
                return (
                  <div
                    className={styles.item}
                    key={`${color.fill}-${color.stroke}-${color.color}`}
                    style={{
                      background: color.fill,
                      border: `2px solid ${color.stroke}`,
                      color: color.color,
                    }}
                    onClick={() => {
                      handleOnSelectColor(color);
                    }}
                  >
                    Aa
                  </div>
                )
              })
            }
          </div>
        )}
      >
        <Tooltip title={'颜色'} placement={'left'}>
          <div className={styles.item}>
            <BiSolidColorFill width={20} height={20} />
          </div>
        </Tooltip>
      </Popover>
      <Popover
        arrow={false}
        trigger={'click'}
        placement={'right'}
        styles={{
          body: {
            padding: 12,
            marginLeft: 12,
          },
        }}
        content={(
          <div className={styles.selectContainer}>
            { strokeWidthOptions.map(strokeOption => (
              <div
                key={strokeOption.label}
                className={classnames(styles.item, { [styles.active]: strokeOption.value === element.strokeWidth })}
                onClick={() => {
                  handleOnSelectStrokeWidth(strokeOption.value);
                }}
              >
                <Tooltip title={strokeOption.label}>
                  <svg width={24} height={24} viewBox={'0 0 24 24'}>
                    <line
                      x1={2}
                      y1={24 - 2}
                      x2={24 - 2}
                      y2={2}
                      stroke={element.stroke === 'transparent' ? 'currentColor' : element.stroke}
                      strokeWidth={strokeOption.value}
                    />
                  </svg>
                </Tooltip>
              </div>
            )) }
          </div>
        )}
      >
        <Tooltip title={'粗细'} placement={'left'}>
          <div className={styles.item}>
            <BsBorderWidth />
          </div>
        </Tooltip>
      </Popover>
      <Popover
        arrow={false}
        trigger={'click'}
        placement={'right'}
        styles={{
          body: {
            marginLeft: 24,
          },
        }}
        content={(
          <div className={styles.alignSelect}>
            {
              alignOptions.map(align => (
                <div
                  key={align.value}
                  className={classnames(styles.item, { [styles.active]: align.value === element.text.align })}
                  onClick={() => handleOnSelectAlign(align.value)}
                >
                  {align.icon}
                </div>
              ))
            }
          </div>
        )}
      >
        <Tooltip title={'对齐'} placement={'left'}>
          <div className={styles.item}>
            <MdOutlineFormatAlignJustify />
          </div>
        </Tooltip>
      </Popover>
    </div>
  )
}

export default GeometrySetter;
