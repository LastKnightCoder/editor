import For from "@/components/For";

import { HIGHLIGHT_COLOR_CLASS_NAMES } from '../constants';
import { Highlight } from '../types.ts';

import './index.css';

interface HighlightProps {
  highlight: Highlight;
  onClick?: () => void;
}

const HighlightNode = (props: HighlightProps) => {
  const { highlight, onClick } = props;

  const { rects, color } = highlight;

  return (
    <For
      data={rects}
      renderItem={(rect, index) => (
        <div
          key={index}
          className={HIGHLIGHT_COLOR_CLASS_NAMES[color]}
          style={{
            position: 'absolute',
            ...rect,
            cursor: 'pointer',
            pointerEvents: 'auto'
          }}
          onClick={onClick}
        />
      )}
    />
  )
}

export default HighlightNode;