/** Only persisted identifiers that changed with the OpenCast name. */
export function currentSettingKey(key: string): string {
  return key === "developer.openSurgecastInDevelopmentMode"
    ? "developer.openOpenCastInDevelopmentMode" : key;
}

export function currentThemeId(value: unknown): unknown {
  return typeof value === "string" && /^surgecast-(dark|light|sky|midnight|dawn)$/.test(value)
    ? value.replace(/^surgecast-/, "opencast-") : value;
}

export function currentSettingValue(key: string, value: unknown): unknown {
  return key === "general.themeDark" || key === "general.themeLight" ? currentThemeId(value) : value;
}
