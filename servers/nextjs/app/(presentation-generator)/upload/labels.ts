import { LanguageType, ToneType, VerbosityType } from "./type";

const LANGUAGE_LABELS: Partial<Record<LanguageType, string>> = {
  [LanguageType.Auto]: "自动（英语）",
  [LanguageType.English]: "英语",
  [LanguageType.ChineseSimplified]: "简体中文",
  [LanguageType.ChineseTraditional]: "繁体中文",
  [LanguageType.Japanese]: "日语",
  [LanguageType.Korean]: "韩语",
  [LanguageType.French]: "法语",
  [LanguageType.German]: "德语",
  [LanguageType.Spanish]: "西班牙语",
};

export const languageLabel = (value: string | null | undefined) =>
  LANGUAGE_LABELS[value as LanguageType] ?? value ?? "选择语言";

export const TONE_LABELS: Record<ToneType, string> = {
  [ToneType.Default]: "默认",
  [ToneType.Casual]: "轻松",
  [ToneType.Professional]: "专业",
  [ToneType.Funny]: "幽默",
  [ToneType.Educational]: "教育",
  [ToneType.Sales_Pitch]: "销售推介",
};

export const VERBOSITY_LABELS: Record<VerbosityType, string> = {
  [VerbosityType.Concise]: "精简",
  [VerbosityType.Standard]: "标准",
  [VerbosityType.Text_Heavy]: "详细",
};
