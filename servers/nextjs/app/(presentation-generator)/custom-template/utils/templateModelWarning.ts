import { notify } from "@/components/ui/sonner";
import type { LLMConfig } from "@/types/llm_config";

const NON_SOTA_TEMPLATE_TOAST_KEY = "presenton.nonSotaTemplateToastDismissed";
const NON_SOTA_TEMPLATE_TOAST_ID = "non-sota-template-generation";

const OPENAI_SOTA_VISION_MODELS = [
    "gpt-5.5",
    "gpt-5.5-pro",
    "gpt-5.4",
    "gpt-5.4-pro",
    "gpt-5",
    "gpt-5-pro",
    "gpt-5-chat-latest",
    "gpt-4.1",
    "gpt-4o",
    "gpt-4-turbo",
];

function selectedTextModel(config: LLMConfig): string {
    switch (config.LLM) {
        case "openai":
            return config.OPENAI_MODEL || "";
        case "azure":
            return config.AZURE_OPENAI_MODEL || "";
        case "openrouter":
            return config.OPENROUTER_MODEL || "";
        case "anthropic":
            return config.ANTHROPIC_MODEL || "";
        case "bedrock":
            return config.BEDROCK_MODEL || "";
        case "codex":
            return config.CODEX_MODEL || "";
        default:
            return "";
    }
}

function normalizeModelName(model: string): string {
    return model.trim().toLowerCase().split("/").pop()?.replace(/^.*anthropic\./, "") || "";
}

function matchesOpenAIModel(model: string, family: string): boolean {
    return model === family || model.startsWith(`${family}-20`);
}

function isSotaTemplateModel(config: LLMConfig): boolean {
    const model = normalizeModelName(selectedTextModel(config));

    if (!model) return false;
    if (OPENAI_SOTA_VISION_MODELS.some((family) => matchesOpenAIModel(model, family))) return true;
    return model.includes("claude-") && (model.includes("opus") || model.includes("sonnet"));
}

function hasDismissedNonSotaToast(): boolean {
    try {
        return typeof window !== "undefined" && window.localStorage.getItem(NON_SOTA_TEMPLATE_TOAST_KEY) === "1";
    } catch {
        return false;
    }
}

function rememberNonSotaToastDismissed() {
    try {
        window.localStorage.setItem(NON_SOTA_TEMPLATE_TOAST_KEY, "1");
    } catch {
        // Best effort only.
    }
}

export function showTemplateV2ModelWarningIfNeeded(config: LLMConfig) {
    if (isSotaTemplateModel(config) || hasDismissedNonSotaToast()) return;

    notify.warning(
        "模板模型提示",
        "模板 V2 更适合使用支持视觉理解的模型。建议使用较新的 OpenAI 视觉模型或 Claude Opus/Sonnet，以获得更可靠的模板生成效果。",
        {
            id: NON_SOTA_TEMPLATE_TOAST_ID,
            duration: Infinity,
            className: "template-v2-model-warning-toast",
            action: {
                label: "不再提示",
                onClick: () => {
                    rememberNonSotaToastDismissed();
                    dismissTemplateV2ModelWarning();
                },
            },
        }
    );
}

export function dismissTemplateV2ModelWarning() {
    notify.dismiss(NON_SOTA_TEMPLATE_TOAST_ID);
}
