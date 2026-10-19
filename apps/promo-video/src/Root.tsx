import "./styles.css";
import { Composition } from "remotion";
import { preloadFonts } from "./brand/fonts";
import { VIDEO } from "./brand/tokens";
import { GLYPHS } from "./films/day/copy";
import { DAY_DURATION, DayFilm } from "./films/day/DayFilm";
import { PRODUCT_DURATION, ProductFilm } from "./films/product/ProductFilm";
import { PRODUCT_GLYPHS } from "./films/product/copy";
import { FEATURE_GLYPHS } from "./films/features/copy";
import { FeatureFilm, featureDuration, type Feature } from "./films/features/FeatureFilm";
import { FEATURE_RANGES } from "./films/features/timeline";
import { GALLERY_PAGES, Gallery, type GalleryPage } from "./films/gallery/Gallery";
import { StyleProbe } from "./films/gallery/StyleProbe";
import { ManifestoProbe, type ManifestoVariant } from "./films/gallery/ManifestoProbe";
import { Measure, MEASURES, type MeasureKey } from "./films/gallery/Measure";
import { StageProvider } from "./kit/Stage";
import { AppThemeProvider } from "./app-kit/theme";
import { STAGES } from "./brand/stage";
import { BOARD_TEXT } from "./mock/board";

preloadFonts(GLYPHS + PRODUCT_GLYPHS + FEATURE_GLYPHS, BOARD_TEXT);

const FEATURE_IDS: Record<Feature, string> = { editor: "Feature-Editor", compose: "Feature-Compose" };

export function Root() {
  return (
    <>
      <Composition id="Product" component={ProductFilm} durationInFrames={PRODUCT_DURATION} {...VIDEO} />
      {(Object.keys(FEATURE_RANGES) as Feature[]).map(feature => (
        <Composition key={feature} id={FEATURE_IDS[feature]} component={FeatureFilm} defaultProps={{ feature }} durationInFrames={featureDuration(feature)} {...VIDEO} />
      ))}
      <Composition id="DayInLife" component={DayFilm} durationInFrames={DAY_DURATION} {...VIDEO} />

      {(Object.keys(GALLERY_PAGES) as GalleryPage[]).map(page => (
        <Composition key={page} id={`Gallery-${page}`} component={Gallery} defaultProps={{ page }} durationInFrames={1} {...VIDEO} />
      ))}
      {MANIFESTO_PROBES.map(({ id, ...props }) => (
        <Composition key={id} id={`Probe-Manifesto-${id}`} component={ManifestoProbeFrame} defaultProps={props} durationInFrames={1} {...VIDEO} />
      ))}
      {(Object.keys(MEASURES) as MeasureKey[]).map(probe => (
        <Composition key={probe} id={`Measure-${probe}`} component={MeasureFrame} defaultProps={{ probe }} durationInFrames={1} fps={VIDEO.fps} width={2600} height={1100} />
      ))}
      {Object.keys(STAGES).map(stage => (
        <Composition key={stage} id={`Stage-${stage}`} component={StyleProbe} defaultProps={{ stage }} durationInFrames={1} {...VIDEO} />
      ))}
    </>
  );
}

/** 对比探针套上产品片的舞台与软件主题 */
const MANIFESTO_PROBES: { id: string; variant: ManifestoVariant; blur?: number; fog?: number }[] = [
  { id: "a", variant: "a" },
  { id: "a-blur9", variant: "a", blur: 9, fog: 0.7 },
  { id: "a-blur5", variant: "a", blur: 5, fog: 0.62 },
  { id: "b", variant: "b" },
  { id: "c", variant: "c" },
];

function ManifestoProbeFrame(props: { variant: ManifestoVariant; blur?: number; fog?: number }) {
  return (
    <StageProvider stage={STAGES.studio}>
      <AppThemeProvider theme={STAGES.studio.appTheme}>
        <ManifestoProbe {...props} />
      </AppThemeProvider>
    </StageProvider>
  );
}

function MeasureFrame(props: { probe: MeasureKey }) {
  return (
    <StageProvider stage={STAGES.studio}>
      <AppThemeProvider theme={STAGES.studio.appTheme}>
        <Measure {...props} />
      </AppThemeProvider>
    </StageProvider>
  );
}
