import { RefObject, useLayoutEffect } from "react";

const useInertControl = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled: boolean,
) => {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.inert = enabled;

    return () => {
      element.inert = false;
    };
  }, [ref, enabled]);
};

export default useInertControl;
