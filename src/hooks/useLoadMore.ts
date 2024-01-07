import { useEffect } from "react";

const useLoadMore = (loaderRef: any, loadMore: () => void) => {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    });
    const loader = loaderRef.current;
    if (loader) {
      observer.observe(loader);
    }
    return () => {
      if (loader) {
        observer.unobserve(loader);
      }
    }
  }, [loadMore]);
}

export default useLoadMore;