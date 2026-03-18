import moduleSectionMapping from "./guideline-sections/mapping.json";
import preambleSection from "./guideline-sections/preamble.md?raw";
import modulesSection from "./guideline-sections/modules.md?raw";
import coreDesignSystemSection from "./guideline-sections/core_design_system.md?raw";
import whenNothingFitsSection from "./guideline-sections/when_nothing_fits.md?raw";
import svgSetupSection from "./guideline-sections/svg_setup.md?raw";
import artIllustrationSection from "./guideline-sections/art_and_illustration.md?raw";
import uiComponentsSection from "./guideline-sections/ui_components.md?raw";
import colorPaletteSection from "./guideline-sections/color_palette.md?raw";
import chartsChartJsSection from "./guideline-sections/charts_chart_js.md?raw";
import diagramTypesSection from "./guideline-sections/diagram_types.md?raw";
import frontendDesignSection from "./frontend-design.md?raw";
import type { GenerativeUiModule } from "./constants";
import { GENERATIVE_UI_AVAILABLE_MODULES } from "./constants";

const SECTION_REGISTRY: Record<string, string> = {
  _preamble: preambleSection,
  Modules: modulesSection,
  "Core Design System": coreDesignSystemSection,
  "When nothing fits": whenNothingFitsSection,
  "SVG setup": svgSetupSection,
  "Art and illustration": artIllustrationSection,
  "UI components": uiComponentsSection,
  "Color palette": colorPaletteSection,
  "Charts (Chart.js)": chartsChartJsSection,
  "Diagram types": diagramTypesSection,
};

const MODULE_SECTIONS = {
  ...(moduleSectionMapping as Record<
    Exclude<GenerativeUiModule, "design">,
    string[]
  >),
  design: ["Frontend design"],
} as Record<GenerativeUiModule, string[]>;

SECTION_REGISTRY["Frontend design"] = frontendDesignSection;

export function getGenerativeUiGuidelines(modules: string[]): string {
  const normalizedModules = modules.filter(
    (moduleName): moduleName is GenerativeUiModule =>
      (GENERATIVE_UI_AVAILABLE_MODULES as readonly string[]).includes(
        moduleName,
      ),
  );

  const includedSections: string[] = [];
  const seenSectionNames = new Set<string>();

  if (normalizedModules.length === 0) {
    normalizedModules.push("interactive");
  }

  for (const moduleName of normalizedModules) {
    const sectionNames = MODULE_SECTIONS[moduleName] || [];
    for (const sectionName of sectionNames) {
      if (seenSectionNames.has(sectionName)) {
        continue;
      }
      const sectionContent = SECTION_REGISTRY[sectionName];
      if (!sectionContent) {
        continue;
      }
      seenSectionNames.add(sectionName);
      includedSections.push(sectionContent.trim());
    }
  }

  return `${includedSections.join("\n\n\n")}\n`;
}
