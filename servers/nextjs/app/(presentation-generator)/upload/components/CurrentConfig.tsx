import { RootState } from '@/store/store';
import { LLM_PROVIDERS, WEB_SEARCH_PROVIDERS } from '@/utils/providerConstants';
import { Eye, Globe2, ImageIcon } from 'lucide-react';
import React from 'react'
import { useSelector } from 'react-redux';

const CurrentConfig = ({ webSearchEnabled }: { webSearchEnabled: boolean }) => {
    const userConfigState = useSelector((state: RootState) => state.userConfig);
    const llmConfig = userConfigState.llm_config;
    const textProviderKey = llmConfig.LLM || "openai";
    const textProviderLabel =
        LLM_PROVIDERS[textProviderKey]?.label || textProviderKey;
    const selectedTextModel =
        textProviderKey === "openai"
            ? llmConfig.OPENAI_MODEL
            : textProviderKey === "deepseek"
                ? llmConfig.DEEPSEEK_MODEL
            : textProviderKey === "google"
                ? llmConfig.GOOGLE_MODEL
                : textProviderKey === "vertex"
                    ? llmConfig.VERTEX_MODEL
                    : textProviderKey === "azure"
                        ? llmConfig.AZURE_OPENAI_MODEL
                        : textProviderKey === "bedrock"
                            ? llmConfig.BEDROCK_MODEL
                        : textProviderKey === "openrouter"
                            ? llmConfig.OPENROUTER_MODEL
                            : textProviderKey === "fireworks"
                                ? llmConfig.FIREWORKS_MODEL
                                : textProviderKey === "together"
                                    ? llmConfig.TOGETHER_MODEL
                            : textProviderKey === "cerebras"
                                ? llmConfig.CEREBRAS_MODEL
                                : textProviderKey === "litellm"
                                    ? llmConfig.LITELLM_MODEL
                                : textProviderKey === "lmstudio"
                                    ? llmConfig.LMSTUDIO_MODEL
                                : textProviderKey === "anthropic"
                                    ? llmConfig.ANTHROPIC_MODEL
                                    : textProviderKey === "ollama"
                                        ? llmConfig.OLLAMA_MODEL
                                        : textProviderKey === "custom"
                                            ? llmConfig.CUSTOM_MODEL
                                            : textProviderKey === "codex"
                                                ? llmConfig.CODEX_MODEL
                                                : "";

    if (process.env.NEXT_PUBLIC_PLATFORM_MODE === "true") {
        const imageEnabled = !llmConfig.DISABLE_IMAGE_GENERATION && !!llmConfig.IMAGE_PROVIDER;
        const capabilities = [
            {
                // Platform operators select the vision model behind the gateway alias.
                label: "视觉模型",
                icon: Eye,
                enabled: !!selectedTextModel,
                status: selectedTextModel ? "已开启" : "未配置",
            },
            {
                label: "图片生成",
                icon: ImageIcon,
                enabled: imageEnabled,
                status: imageEnabled ? "已开启" : llmConfig.DISABLE_IMAGE_GENERATION ? "已关闭" : "未配置",
            },
            {
                label: "网络搜索",
                icon: Globe2,
                enabled: webSearchEnabled,
                status: webSearchEnabled ? "已开启" : "已关闭",
            },
        ];

        return (
            <ul aria-label="生成能力" className="flex flex-wrap items-center gap-2">
                {capabilities.map(({ label, icon: Icon, enabled, status }) => (
                    <li
                        key={label}
                        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs leading-4 ${
                            enabled ? "border-[#EDE9FE] bg-[#F8F7FF]" : "border-slate-200 bg-slate-50"
                        }`}
                    >
                        <Icon
                            aria-hidden="true"
                            className={`hidden h-3.5 w-3.5 shrink-0 sm:block ${enabled ? "text-[#7A5AF8]" : "text-slate-400"}`}
                        />
                        <span className="font-medium text-slate-600">{label}</span>
                        <span className={`text-[11px] ${enabled ? "text-emerald-700" : "text-slate-500"}`}>
                            {status}
                        </span>
                    </li>
                ))}
            </ul>
        );
    }

    const textSummary = textProviderKey === "litellm" && selectedTextModel
        ? selectedTextModel
        : selectedTextModel
            ? `${textProviderLabel} (${selectedTextModel})`
            : textProviderLabel;

    const imageSummary = llmConfig.DISABLE_IMAGE_GENERATION
        ? "图片生成：关闭"
        : llmConfig.IMAGE_PROVIDER
            ? "图片生成：开启"
            : "图片生成：未配置";
    const webSearchProviderKey = (llmConfig.WEB_SEARCH_PROVIDER || "auto").toLowerCase();
    const webSearchProvider =
        WEB_SEARCH_PROVIDERS[webSearchProviderKey]?.label || webSearchProviderKey;
    const webSearchSummary = `联网：${webSearchProvider}（${webSearchEnabled ? "开启" : "关闭"}）`;

    return (
        <p className="rounded-[50px] border border-[#EDEEEF] px-2.5 py-0.5 text-[10px] font-medium text-[#7A5AF8] min-[1800px]:px-3 min-[1800px]:py-1 min-[1800px]:text-[11px] min-[2200px]:px-4 min-[2200px]:text-xs">
            {textSummary} · {imageSummary} · {webSearchSummary}
        </p>

    )
}

export default CurrentConfig
