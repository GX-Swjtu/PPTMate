export const REMOTE_FONT_ACCESS_ENABLED =
  process.env.NEXT_PUBLIC_PLATFORM_MODE !== "true";

export function isAllowedFontSource(source: string) {
  if (REMOTE_FONT_ACCESS_ENABLED) return true;
  const normalized = source.trim();
  return (
    (normalized.startsWith("/") && !normalized.startsWith("//")) ||
    normalized.startsWith("data:")
  );
}
