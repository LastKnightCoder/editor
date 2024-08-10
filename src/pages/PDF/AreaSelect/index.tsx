import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import PortalToBody from "@/components/PortalToBody";
import { Rect } from '../types.ts';

interface Point {
  x: number;
  y: number;
}

interface AreaSelectProps {
  onSelectStart: (pageNumber: number) => void;
  onSelectFinish: (area: Rect, pageNumber: number) => void;
}

const AreaSelect = (props: AreaSelectProps) => {
  const { onSelectFinish, onSelectStart } = props;

  const [isAreaSelect, setIsAreaSelect] = useState(false);
  const [start, setStart] = useState<Point | null>();
  const [end, setEnd] = useState<Point | null>();
  const pageNumberRef = useRef<number | null>(null);

  const handleMouseDown = useMemoizedFn((e: MouseEvent) => {
    if (!e.altKey) {
      setIsAreaSelect(false);
      return;
    }
    const target = e.target as HTMLElement;
    if (!target) return;
    const pageEle = target.closest('.page') as (HTMLElement | null);
    if (!pageEle) return;
    const pageNumber = Number(pageEle.dataset.pageNumber);
    pageNumberRef.current = pageNumber;
    setStart({ x: e.pageX, y: e.pageY });
    onSelectStart(pageNumber);
    setIsAreaSelect(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });

  const handleMouseMove = useMemoizedFn((e: MouseEvent) => {
    if (!start || !isAreaSelect) return;
    const { pageX, pageY } = e;
    setEnd({ x: pageX, y: pageY });
  });

  const handleMouseUp = useMemoizedFn(() => {
    if (!start || !isAreaSelect || !end) return;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);


    onSelectFinish({
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.abs(start.x - end.x),
      height: Math.abs(start.y - end.y),
    }, pageNumberRef.current!);

    setIsAreaSelect(false);
    setStart(null);
    setEnd(null);
    pageNumberRef.current = null;
  })

  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    }
  }, [handleMouseDown]);

  if (!isAreaSelect || !start || !end) return null;

  return (
    <PortalToBody>
      <div style={{
        position: 'fixed',
        left: start.x,
        top: start.y,
        width: end.x - start.x,
        height: end.y - start.y,
        backgroundColor: 'rgba(255, 0, 0, 0.3)',
        border: '2px solid rgba(255, 0, 0, 0.6)',
        zIndex: 9999,
      }} />
    </PortalToBody>
  )
}

export default AreaSelect;