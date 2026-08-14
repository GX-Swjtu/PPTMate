import { NextResponse } from "next/server";
import { authStatusForRequest } from "@/lib/server-auth-role";
import { readUserConfigFile } from "@/lib/user-config-store";
import { hasValidLLMConfig, normalizeLLMConfig } from "@/utils/storeHelpers";
import { LLMConfig } from "@/types/llm_config";

export const dynamic = "force-dynamic";

const SECRET_FIELD = /(API_KEY|ACCESS_KEY|SECRET|TOKEN|PASSWORD)/i;

export function configFromEnvironment(): LLMConfig {
  return normalizeLLMConfig({
    LLM: process.env.LLM,
    LITELLM_BASE_URL: process.env.LITELLM_BASE_URL,
    LITELLM_MODEL: process.env.LITELLM_MODEL,
    LITELLM_API_KEY: process.env.LITELLM_API_KEY
      ? "__configured__"
      : "",
    CUSTOM_LLM_URL: process.env.CUSTOM_LLM_URL,
    CUSTOM_MODEL: process.env.CUSTOM_MODEL,
    CUSTOM_LLM_API_KEY: process.env.CUSTOM_LLM_API_KEY
      ? "__configured__"
      : "",
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    DISABLE_IMAGE_GENERATION:
      (process.env.DISABLE_IMAGE_GENERATION || "true").toLowerCase() === "true",
    OPENAI_COMPAT_IMAGE_BASE_URL: process.env.OPENAI_COMPAT_IMAGE_BASE_URL,
    OPENAI_COMPAT_IMAGE_MODEL: process.env.OPENAI_COMPAT_IMAGE_MODEL,
    OPENAI_COMPAT_IMAGE_API_KEY: process.env.OPENAI_COMPAT_IMAGE_API_KEY
      ? "__configured__"
      : "",
    WEB_GROUNDING:
      (process.env.WEB_GROUNDING || "false").toLowerCase() === "true",
    WEB_SEARCH_PROVIDER: process.env.WEB_SEARCH_PROVIDER || "auto",
    DISABLE_ANONYMOUS_TRACKING: "true",
  });
}

export function runtimeConfigStatusFromEnvironment() {
  const config = configFromEnvironment();
  return { configured: hasValidLLMConfig(config), config };
}

export async function GET(request: Request) {
  const auth = await authStatusForRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const path = process.env.USER_CONFIG_PATH;
  if (!path) {
    return NextResponse.json(
      runtimeConfigStatusFromEnvironment(),
      { status: 200 }
    );
  }
  try {
    const stored = readUserConfigFile<LLMConfig>(path) || {};
    const full = normalizeLLMConfig(
      Object.keys(stored).length ? stored : configFromEnvironment()
    );
    const config = Object.fromEntries(
      Object.entries(full).map(([key, value]) => [
        key,
        SECRET_FIELD.test(key) ? (value ? "__configured__" : "") : value,
      ])
    );
    return NextResponse.json({
      configured: hasValidLLMConfig(full),
      config,
    });
  } catch {
    return NextResponse.json(
      { configured: false, config: {} },
      { status: 200 }
    );
  }
}
