const STORAGE_KEY = "alpha:first-touch-attribution";

export function captureFirstTouch(search, storage) {
  const params = new URLSearchParams(search);
  const current = {
    source: params.get("utm_source")?.trim() || "",
    medium: params.get("utm_medium")?.trim() || "",
    campaign: params.get("utm_campaign")?.trim() || "",
  };

  let saved;
  try {
    saved = storage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Could not read campaign attribution from this browser.", error);
    return current;
  }
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          source: typeof parsed.source === "string" ? parsed.source : "",
          medium: typeof parsed.medium === "string" ? parsed.medium : "",
          campaign: typeof parsed.campaign === "string" ? parsed.campaign : "",
        };
      }
    } catch (error) {
      console.warn("Stored campaign attribution was invalid and will be replaced.", error);
    }
  }
  if (Object.values(current).some(Boolean)) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (error) {
      console.warn("Could not persist campaign attribution in this browser.", error);
    }
  }
  return current;
}
