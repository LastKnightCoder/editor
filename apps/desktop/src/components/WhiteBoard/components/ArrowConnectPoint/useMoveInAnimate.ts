import gsap from "gsap";
import { useEffect, MutableRefObject } from "react";

const useMoveInAnimate = (
  ref: MutableRefObject<SVGCircleElement | null>,
  r: number,
) => {
  useEffect(() => {
    const circle = ref.current;
    if (!circle) return;

    const onPointerEnter = () => {
      gsap.to(circle, {
        attr: {
          r: r + 2,
        },
        duration: 0.2,
        ease: "power1.inOut",
      });
    };

    const onPointerLeave = () => {
      gsap.to(circle, {
        attr: {
          r,
        },
        duration: 0.2,
        ease: "power1.inOut",
      });
    };

    circle.addEventListener("pointerenter", onPointerEnter);
    circle.addEventListener("pointerleave", onPointerLeave);

    return () => {
      circle.removeEventListener("pointerenter", onPointerEnter);
      circle.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [r]);
};

export default useMoveInAnimate;
