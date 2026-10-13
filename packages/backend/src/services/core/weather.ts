import type { CalculatorResult } from "@surgecast/protocol";
interface Place { name: string; latitude: number; longitude: number; country?: string; }
/** Explicit city queries only; never request or infer the user's location. */
export function weatherPlace(input: string): string | null {
  return /^(?:weather|temperature)\s+(?:in\s+)?(.+)$/i.exec(input.trim())?.[1]?.trim()
    ?? /^(.+?)\s+weather$/i.exec(input.trim())?.[1]?.trim() ?? null;
}
export async function weatherResult(input: string): Promise<CalculatorResult | null> {
  const place = weatherPlace(input);
  if (!place || place.length < 2) return null;
  try {
    const get = async (url: string) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error("Weather unavailable");
      return response.json();
    };
    const geo = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geo.search = new URLSearchParams({ name: place, count: "1", language: "en", format: "json" }).toString();
    const location = ((await get(geo.href)) as { results?: Place[] }).results?.[0];
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), current: "temperature_2m", daily: "temperature_2m_max,temperature_2m_min", forecast_days: "1", timezone: "auto" }).toString();
    const forecast = await get(url.href) as { current?: { temperature_2m?: number }; daily?: { temperature_2m_min?: number[]; temperature_2m_max?: number[] } };
    const value = forecast.current?.temperature_2m;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const low = forecast.daily?.temperature_2m_min?.[0], high = forecast.daily?.temperature_2m_max?.[0];
    return { input, interpreted: `${location.name}${location.country ? `, ${location.country}` : ""}`, result: `${value} °C`, copyValue: `${value} °C`,
      kind: "unit", inputLabel: "Weather · Open-Meteo", resultLabel: Number.isFinite(low) && Number.isFinite(high) ? `${low}–${high} °C today` : "Temperature" };
  } catch { return null; }
}
