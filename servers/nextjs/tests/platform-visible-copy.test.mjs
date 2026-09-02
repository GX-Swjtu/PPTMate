import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const nextRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readSource(relativePath) {
  return readFile(path.join(nextRoot, relativePath), "utf8");
}

test("platform entry points use the PPTMate brand and approved Chinese copy", async () => {
  const [
    uploadPage,
    uploadForm,
    sidebar,
    header,
    mark,
    templatePreview,
    currentConfig,
    providerConstants,
    generationModeDialog,
    chat,
    generationMetrics,
    infographicEditor,
    editorShortcuts,
    shapeToolbar,
    presentationActions,
  ] = await Promise.all([
    readSource("app/(presentation-generator)/upload/page.tsx"),
    readSource("app/(presentation-generator)/upload/components/UploadPage.tsx"),
    readSource("app/(presentation-generator)/(dashboard)/Components/DashboardSidebar.tsx"),
    readSource("app/(presentation-generator)/(dashboard)/dashboard/components/Header.tsx"),
    readSource("public/pptmate-mark.svg"),
    readSource(
      "app/(presentation-generator)/components/TemplatePreviewComponents.tsx",
    ),
    readSource(
      "app/(presentation-generator)/upload/components/CurrentConfig.tsx",
    ),
    readSource("utils/providerConstants.ts"),
    readSource(
      "app/(presentation-generator)/upload/components/GenerationModeDialog.tsx",
    ),
    readSource(
      "app/(presentation-generator)/presentation/components/Chat.tsx",
    ),
    readSource(
      "app/(presentation-generator)/presentation/components/StreamingGenerationMetrics.tsx",
    ),
    readSource(
      "components/slide-editor/infographics/InfographicEditorContent.tsx",
    ),
    readSource("components/slide-editor/shortcuts/editorShortcuts.ts"),
    readSource("components/slide-editor/shapes/ShapeToolbar.tsx"),
    readSource(
      "app/(presentation-generator)/presentation/components/PresentationActions.tsx",
    ),
  ]);

  assert.match(uploadPage, /PPTMate/);
  assert.match(uploadPage, /智能演示生产平台/);
  assert.match(
    uploadPage,
    /上传资料，通过 AI 快速生成、修改和完善演示文稿。/,
  );
  assert.match(mark, /<svg/);
  assert.doesNotMatch(mark, /fill="none"/);
  assert.match(uploadForm, /LanguageType\.ChineseSimplified/);
  assert.match(sidebar, /src="\/pptmate-mark\.svg"/);
  assert.match(header, /src="\/pptmate-mark\.svg"/);
  assert.match(templatePreview, /模板-\{count\}页/);
  assert.doesNotMatch(templatePreview, /版式-\{count\}/);
  assert.match(
    currentConfig,
    /textProviderKey === "litellm" && selectedTextModel\s*\? selectedTextModel/,
  );
  assert.match(currentConfig, /图片生成：开启/);
  assert.match(currentConfig, /联网：/);
  assert.match(providerConstants, /label: "模型原生"/);
  assert.doesNotMatch(providerConstants, /Default \(Model\)/);
  assert.match(generationModeDialog, /选择生成模式/);
  assert.doesNotMatch(generationModeDialog, /Select Mode/);
  assert.match(chat, /对话记录/);
  assert.doesNotMatch(chat, /No saved conversations yet/);
  assert.match(generationMetrics, /输入 \{formatTokens/);
  assert.doesNotMatch(generationMetrics, /Live token counts/);
  assert.match(infographicEditor, /编辑信息图/);
  assert.doesNotMatch(infographicEditor, /Edit Infographic/);
  assert.match(editorShortcuts, /title: "幻灯片导航"/);
  assert.doesNotMatch(editorShortcuts, /title: "Slide navigation"/);
  assert.match(shapeToolbar, /title="线条起点与终点"/);
  assert.match(
    presentationActions,
    /"vector-line-filled-both": "双向实心箭头"/,
  );
});

test("startup routing has no brand animation or fixed minimum delay", async () => {
  const [rootPage, initializer, authGate, loader] = await Promise.all([
    readSource("app/page.tsx"),
    readSource("app/ConfigurationInitializer.tsx"),
    readSource("components/Auth/AuthGate.tsx"),
    readSource("components/ui/presenton-splash-loader.tsx"),
  ]);

  assert.match(rootPage, /redirect\("\/upload"\)/);
  assert.doesNotMatch(rootPage, /ConfigurationInitializer/);
  assert.match(initializer, /PRESENTON_SPLASH_MIN_DURATION_MS/);
  assert.match(authGate, /PRESENTON_SPLASH_MIN_DURATION_MS/);
  assert.match(loader, /PRESENTON_SPLASH_MIN_DURATION_MS = 0/);
  assert.match(loader, /configuration-loader/);
  assert.doesNotMatch(loader, /pptmate-mark-reverse\.svg/);
  assert.doesNotMatch(loader, /SPLASH_ANIMATION_MS/);
});

test("Chinese labels do not replace editor protocol values", async () => {
  const [actions, insertElements, sidePanels] = await Promise.all([
    readSource(
      "app/(presentation-generator)/presentation/components/PresentationActions.tsx",
    ),
    readSource("components/slide-editor/insert/insert-elements.ts"),
    readSource(
      "app/(presentation-generator)/template-preview/components/editor/TemplatePreviewSidePanels.tsx",
    ),
  ]);

  assert.match(actions, /"Basic Shapes": "基础形状"/);
  assert.match(insertElements, /label: "Basic Shapes"/);
  assert.match(sidePanels, /\["Low", "Medium", "High"\]/);
  assert.match(sidePanels, /Low: "低"/);
  assert.match(sidePanels, /Medium: "中"/);
  assert.match(sidePanels, /High: "高"/);
});
