import fs from "node:fs";
import path from "node:path";

type IllustrationStepDefinition = {
  step: number;
  file_name: string;
  comment: string;
  state_key: string;
  prompt_label: string;
};

type IllustrationGraphicDefinition = {
  group_key: string;
  category_key: string;
  title: string;
  asset_base_path: string;
  steps: IllustrationStepDefinition[];
};

type IllustrationDefinition = {
  progress_graphics: IllustrationGraphicDefinition[];
  fallback_category_key: string;
};

type GoalVisualCategoryKey =
  | "ITEMS"
  | "VEHICLES"
  | "TRAVEL"
  | "LIFE_EVENT"
  | "EDUCATION"
  | "HOBBY"
  | "OTHER";

type GoalVisualSelection = {
  visualCategory: string;
  visualSubcategory: string;
};

let cachedDefinition: IllustrationDefinition | null = null;

function getRepoRoot() {
  const currentDirectory = process.cwd();
  const directPath = path.resolve(currentDirectory, "develop/illustration.json");

  if (fs.existsSync(directPath)) {
    return currentDirectory;
  }

  return path.resolve(currentDirectory, "..");
}

function loadDefinition() {
  if (cachedDefinition) {
    return cachedDefinition;
  }

  const filePath = path.resolve(getRepoRoot(), "develop/illustration.json");
  const raw = fs.readFileSync(filePath, "utf8");
  cachedDefinition = JSON.parse(raw) as IllustrationDefinition;
  return cachedDefinition;
}

function stripImageRoot(assetBasePath: string) {
  return assetBasePath.replace(/^img\//, "").replace(/\/$/, "");
}

function resolveAssetFileName(graphic: IllustrationGraphicDefinition, fallbackFileName: string) {
  const directoryPath = path.resolve(getRepoRoot(), graphic.asset_base_path);

  if (!fs.existsSync(directoryPath)) {
    return fallbackFileName;
  }

  const exactPath = path.resolve(directoryPath, fallbackFileName);
  if (fs.existsSync(exactPath)) {
    return fallbackFileName;
  }

  const baseName = path.parse(fallbackFileName).name;
  const matched = fs
    .readdirSync(directoryPath)
    .find((fileName) => path.parse(fileName).name === baseName);

  return matched ?? fallbackFileName;
}

function toImagePath(graphic: IllustrationGraphicDefinition, fileName: string) {
  return `/${path.posix.join(stripImageRoot(graphic.asset_base_path), fileName)}`;
}

function toVisualCategory(groupKey: string): GoalVisualCategoryKey {
  const map: Record<string, GoalVisualCategoryKey> = {
    items: "ITEMS",
    vehicles: "VEHICLES",
    travel: "TRAVEL",
    life_events: "LIFE_EVENT",
    education: "EDUCATION",
    hobby: "HOBBY",
    fallback: "OTHER"
  };

  return map[groupKey] ?? "OTHER";
}

function toGraphicGroupKey(visualCategory: string) {
  const map: Record<string, string> = {
    ITEMS: "items",
    VEHICLES: "vehicles",
    TRAVEL: "travel",
    LIFE_EVENT: "life_events",
    EDUCATION: "education",
    HOBBY: "hobby",
    OTHER: "fallback"
  };

  return map[visualCategory] ?? "fallback";
}

function getFallbackGraphic() {
  return (
    loadDefinition().progress_graphics.find((graphic) => graphic.group_key === "fallback")
    ?? loadDefinition().progress_graphics[0]
  );
}

function findGraphic(selection: GoalVisualSelection) {
  const groupKey = toGraphicGroupKey(selection.visualCategory);
  const normalizedSubcategory =
    selection.visualCategory === "OTHER" && selection.visualSubcategory === "generic"
      ? loadDefinition().fallback_category_key
      : selection.visualSubcategory;

  return (
    loadDefinition().progress_graphics.find(
      (graphic) =>
        graphic.group_key === groupKey && graphic.category_key === normalizedSubcategory
    ) ?? getFallbackGraphic()
  );
}

export function listGoalVisualOptions() {
  return loadDefinition().progress_graphics.map((graphic) => {
    const previewStep = graphic.steps.find((step) => step.step === 1) ?? graphic.steps[0];
    const previewFileName = resolveAssetFileName(graphic, previewStep.file_name);

    return {
      id: `${graphic.group_key}:${graphic.category_key}`,
      title: graphic.title,
      visualCategory: toVisualCategory(graphic.group_key),
      visualSubcategory:
        graphic.group_key === "fallback" && graphic.category_key === loadDefinition().fallback_category_key
          ? "generic"
          : graphic.category_key,
      imagePath: toImagePath(graphic, previewFileName),
      comment: previewStep.comment,
      promptLabel: previewStep.prompt_label
    };
  });
}

export function normalizeGoalVisualSelection(selection?: Partial<GoalVisualSelection>) {
  const visualCategory = selection?.visualCategory ?? "OTHER";
  const visualSubcategory =
    selection?.visualSubcategory && selection.visualSubcategory.trim().length > 0
      ? selection.visualSubcategory
      : "generic";
  const graphic = findGraphic({ visualCategory, visualSubcategory });

  return {
    visualCategory: toVisualCategory(graphic.group_key),
    visualSubcategory:
      graphic.group_key === "fallback" && graphic.category_key === loadDefinition().fallback_category_key
        ? "generic"
        : graphic.category_key
  };
}

export function getGoalVisualContent(selection: GoalVisualSelection, step: number) {
  const graphic = findGraphic(selection);
  const activeStep =
    graphic.steps.find((item) => item.step === step)
    ?? graphic.steps[graphic.steps.length - 1]
    ?? graphic.steps[0];
  const completeStep = graphic.steps[graphic.steps.length - 1] ?? activeStep;
  const activeFileName = resolveAssetFileName(graphic, activeStep.file_name);
  const completeFileName = resolveAssetFileName(graphic, completeStep.file_name);

  return {
    headlineText: activeStep.comment,
    imagePath: toImagePath(graphic, activeFileName),
    completeImagePath: toImagePath(graphic, completeFileName),
    altText: `${graphic.title}の進捗イラスト`
  };
}
