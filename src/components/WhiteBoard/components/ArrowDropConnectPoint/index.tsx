import { memo, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ARROW_CONNECT_POINT_FILL, ARROW_CONNECT_POINT_RADIUS } from '../../constants';

interface ArrowDropConnectPointProps {
  cx: number;
  cy: number;
  isActive: boolean;
}

const ArrowDropConnectPoint = memo((props: ArrowDropConnectPointProps) => {
  const { cx, cy, isActive } = props;

  const ref = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const circle = ref.current;
    if (!circle) return;
    
    if (isActive) {
      gsap.to(circle, {
        attr: {
          r: 0
        },
        duration: 0.2,
        ease: 'power1.inOut'
      });
    } else {
      gsap.to(circle, {
        attr: {
          r: ARROW_CONNECT_POINT_RADIUS
        },
        duration: 0.2,
        ease: 'power1.inOut'
      });
    }
  }, [isActive])

  return (
    <>
      <circle
        cx={cx}
        cy={cy}
        r={ARROW_CONNECT_POINT_RADIUS + 2}
        fill={ARROW_CONNECT_POINT_FILL}
      />
      <circle
        ref={ref}
        cx={cx}
        cy={cy}
        r={ARROW_CONNECT_POINT_RADIUS}
        fill={'white'}
      />
    </>
  )
});

export default ArrowDropConnectPoint;

