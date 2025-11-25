import classNames from "classnames";
import {
  ThumbnailsPane,
  ThumbImg,
  type ThumbMeta,
} from "@embedpdf/plugin-thumbnail/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";

const PdfEmbedThumbnails = () => {
  const { state, provides } = useScroll();

  return (
    <div className="pdf-embed-thumbnails">
      <ThumbnailsPane className="pdf-embed-thumbnails-pane">
        {(meta: ThumbMeta) => {
          const isActive = state?.currentPage === meta.pageIndex + 1;
          return (
            <div
              key={meta.pageIndex}
              className={classNames("pdf-embed-thumb-row", {
                "pdf-embed-thumb-row-active": isActive,
              })}
              style={{
                top: meta.top,
                height: meta.wrapperHeight,
              }}
              onClick={() =>
                provides?.scrollToPage({ pageNumber: meta.pageIndex + 1 })
              }
            >
              <div
                className="pdf-embed-thumb-image"
                style={{
                  width: meta.width,
                  height: meta.height,
                  padding: meta.padding || 0,
                }}
              >
                <ThumbImg meta={meta} />
              </div>
              <div
                className="pdf-embed-thumb-label"
                style={{ height: meta.labelHeight }}
              >
                {meta.pageIndex + 1}
              </div>
            </div>
          );
        }}
      </ThumbnailsPane>
    </div>
  );
};

export default PdfEmbedThumbnails;
