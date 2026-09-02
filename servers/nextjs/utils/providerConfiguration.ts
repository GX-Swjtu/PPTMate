import type { LLMConfig } from "@/types/llm_config";

export type ProviderConfigurationSource = "editable" | "runtime";

export interface ProviderConfigurationSnapshot {
  config: LLMConfig;
  configured: boolean | null;
}

export class ProviderConfigurationRequestError extends Error {
  constructor(
    readonly source: ProviderConfigurationSource,
    readonly status: number,
  ) {
    super(
      `${source === "editable" ? "user-config" : "runtime-config"} returned ${status}`,
    );
    this.name = "ProviderConfigurationRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function providerConfigurationSourceFor(
  canChangeKeys: boolean,
): ProviderConfigurationSource {
  return canChangeKeys ? "editable" : "runtime";
}

/**
 * Load provider configuration from the endpoint allowed for the current mode.
 * Runtime configuration is already secret-redacted by its server route.
 */
export async function fetchProviderConfiguration(
  source: ProviderConfigurationSource,
  request: typeof fetch = fetch,
): Promise<ProviderConfigurationSnapshot> {
  const endpoint =
    source === "editable" ? "/api/user-config" : "/api/runtime-config";
  const response = await request(endpoint, { cache: "no-store" });

  if (!response.ok) {
    throw new ProviderConfigurationRequestError(source, response.status);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error(`${endpoint} returned an invalid response`);
  }

  if (source === "editable") {
    return {
      config: payload as LLMConfig,
      configured: null,
    };
  }

  if (!isRecord(payload.config) || typeof payload.configured !== "boolean") {
    throw new Error(`${endpoint} returned an invalid response`);
  }

  return {
    config: payload.config as LLMConfig,
    configured: payload.configured,
  };
}
