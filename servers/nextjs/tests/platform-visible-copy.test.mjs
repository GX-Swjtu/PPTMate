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
    splash,
    mark,
    reverseMark,
    templatePreview,
    currentConfig,
    providerConstants,
  ] = await Promise.all([
    readSource("app/(presentation-generator)/upload/page.tsx"),
    readSource("app/(presentation-generator)/upload/components/UploadPage.tsx"),
    readSource("app/(presentation-generator)/(dashboard)/Components/DashboardSidebar.tsx"),
    readSource("app/(presentation-generator)/(dashboard)/dashboard/components/Header.tsx"),
    readSource("components/ui/presenton-splash-loader.tsx"),
    readSource("public/pptmate-mark.svg"),
    readSource("public/pptmate-mark-reverse.svg"),
    readSource(
      "app/(presentation-generator)/components/TemplatePreviewComponents.tsx",
    ),
    readSource(
      "app/(presentation-generator)/upload/components/CurrentConfig.tsx",
    ),
    readSource("utils/providerConstants.ts"),
  ]);

  for (const source of [uploadPage, splash]) {
    assert.match(source, /PPTMate/);
    assert.match(source, /智能演示生产平台/);
  }
  assert.match(
    uploadPage,
    /上传资料，通过 AI 快速生成、修改和完善演示文稿。/,
  );
  assert.match(mark, /<svg/);
  assert.match(reverseMark, /<svg/);
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
