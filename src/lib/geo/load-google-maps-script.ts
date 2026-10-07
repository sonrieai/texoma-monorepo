let loadPromise: Promise<void> | null = null;

/** Loads the Google Maps JavaScript API once per page session. */
export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-texoma-google-maps="1"]',
  );
  if (existing) {
    loadPromise ??= new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Maps script failed")),
        { once: true },
      );
    });
    return loadPromise;
  }

  loadPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.texomaGoogleMaps = "1";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
