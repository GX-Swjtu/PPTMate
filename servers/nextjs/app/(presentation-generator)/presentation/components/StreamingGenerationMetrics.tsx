"use client";

import type { GenerationMetrics } from "@/store/slices/presentationGeneration";

const integerFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const formatTokens = (value: number | null, estimated = false) => {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${estimated ? "~" : ""}${integerFormatter.format(Math.round(value))}`;
};

export default function StreamingGenerationMetrics({
  metrics,
}: {
  metrics: GenerationMetrics;
}) {
  const thinkingPending =
    metrics.supports_thinking &&
    metrics.thinking_tokens_estimated &&
    (metrics.thinking_tokens ?? 0) === 0;

  return (
    <div
      aria-live="polite"
      className="hidden h-[38px] shrink-0 items-center rounded-[80px] border border-[#E4E2EB] bg-[#F6F6F9] px-3 font-syne sm:flex"
      title={
        metrics.estimated
          ? "供应商返回最终用量前，实时 Token 数为估算值。"
          : `${metrics.model || "当前模型"} 返回的最终用量`
      }
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#555766]">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            metrics.estimated ? "animate-pulse bg-[#6847F4]" : "bg-emerald-500"
          }`}
        />
        <span className="whitespace-nowrap">
          输入 {formatTokens(metrics.input_tokens, metrics.estimated)}
        </span>
        <span className="h-3.5 w-px bg-[#D8D8DF]" aria-hidden="true" />
        <span className="whitespace-nowrap">
          输出 {formatTokens(metrics.output_tokens, metrics.estimated)}
        </span>
        {metrics.supports_thinking ? (
          <>
            <span className="h-3.5 w-px bg-[#D8D8DF]" aria-hidden="true" />
            <span
              className={`whitespace-nowrap ${
                thinkingPending ? "animate-pulse text-[#6847F4]" : ""
              }`}
              title={
                thinkingPending
                  ? "推理已开启，正在等待思考 Token 用量。"
                  : undefined
              }
            >
              思考{" "}
              {formatTokens(
                metrics.thinking_tokens,
                metrics.thinking_tokens_estimated
              )}
            </span>
          </>
        ) : null}
        <span className="h-3.5 w-px bg-[#D8D8DF]" aria-hidden="true" />
        <span className="whitespace-nowrap">
          {decimalFormatter.format(metrics.tokens_per_second)} Token/秒
        </span>
      </div>
    </div>
  );
}
