const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID?.trim() || "";
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || "";
const PURCHASE_EVENTS_KEY = "alpha:purchase-events";
const EXPERIMENT_VISITOR_KEY = "alpha:experiment-visitor";
let metaInitialized = false;
let googleInitialized = false;
let lastPagePath = "";

function loadScript(id, source) {
  if (document.querySelector(`script[data-alpha-analytics="${id}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = source;
  script.dataset.alphaAnalytics = id;
  document.head.appendChild(script);
}

function initializeMetaPixel() {
  if (!META_PIXEL_ID || metaInitialized) return;
  const pixel = window.fbq || function fbq() {
    pixel.callMethod ? pixel.callMethod.apply(pixel, arguments) : pixel.queue.push(arguments);
  };
  if (!window.fbq) {
    pixel.push = pixel;
    pixel.loaded = true;
    pixel.version = "2.0";
    pixel.queue = [];
    window.fbq = pixel;
    window._fbq = pixel;
  }
  loadScript("meta-pixel", "https://connect.facebook.net/en_US/fbevents.js");
  pixel("init", META_PIXEL_ID);
  metaInitialized = true;
}

function initializeGoogleAnalytics() {
  if (!GA_MEASUREMENT_ID || googleInitialized) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
  loadScript("google-analytics", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`);
  googleInitialized = true;
}

export function trackPageView(path) {
  if (lastPagePath === path) return;
  lastPagePath = path;
  if (path.startsWith("/admin")) return;
  initializeMetaPixel();
  initializeGoogleAnalytics();
  if (META_PIXEL_ID) window.fbq("track", "PageView");
  if (GA_MEASUREMENT_ID) {
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: path,
      page_title: document.title,
    });
  }
}

export function trackCommerceEvent(eventName, details = {}) {
  initializeMetaPixel();
  initializeGoogleAnalytics();
  const {
    id,
    name,
    price,
    quantity = 1,
    currency = "INR",
    variant,
    campaign,
    items,
  } = details;
  const content = items || (id ? [{ item_id: String(id), item_name: name, price: Number(price), quantity }] : []);
  const value = details.value ?? content.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const metaEvent = {
    view_item: "ViewContent",
    add_to_cart: "AddToCart",
    begin_checkout: "InitiateCheckout",
    purchase: "Purchase",
  }[eventName];
  if (META_PIXEL_ID && metaEvent) {
    window.fbq("track", metaEvent, {
      content_type: "product",
      ...(id ? { content_ids: [String(id)] } : {}),
      ...(name ? { content_name: name } : {}),
      ...(content.length ? { contents: content.map((item) => ({ id: String(item.item_id || item.id || ""), quantity: Number(item.quantity || 1), item_price: Number(item.price || 0) })) } : {}),
      value: Number(value),
      currency,
      ...(variant ? { headline_variant: variant } : {}),
      ...(campaign ? { campaign } : {}),
    });
  }
  if (GA_MEASUREMENT_ID) {
    window.gtag("event", eventName, {
      currency,
      value: Number(value),
      ...(content.length ? { items: content } : {}),
      ...(variant ? { headline_variant: variant } : {}),
      ...(campaign ? { campaign } : {}),
      ...details,
    });
  }
}

export function trackPurchaseOnce(orderNumber, details = {}) {
  const key = String(orderNumber || "").trim();
  if (!key || (!META_PIXEL_ID && !GA_MEASUREMENT_ID)) return;
  let seen = [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(PURCHASE_EVENTS_KEY) || "[]");
    if (Array.isArray(stored)) seen = stored.filter((value) => typeof value === "string");
  } catch (error) {
    console.warn("Could not read browser purchase-event history.", error);
  }
  if (seen.includes(key)) return;
  trackCommerceEvent("purchase", { transaction_id: key, ...details });
  try {
    window.localStorage.setItem(PURCHASE_EVENTS_KEY, JSON.stringify([...seen, key].slice(-200)));
  } catch (error) {
    console.warn("Could not save browser purchase-event history.", error);
  }
}

export function getHeadlineVariant(slug, variantHeadline, search, storage) {
  if (!variantHeadline?.trim()) return { variant: "A", headline: "" };
  const forced = new URLSearchParams(search).get("ab_variant")?.toUpperCase();
  if (forced === "A" || forced === "B") {
    return { variant: forced, headline: forced === "B" ? variantHeadline : "", overridden: true };
  }
  const key = `alpha:headline-variant:${slug}`;
  try {
    const saved = storage.getItem(key);
    if (saved === "A" || saved === "B") {
      return { variant: saved, headline: saved === "B" ? variantHeadline : "" };
    }
    const variant = Math.random() < 0.5 ? "A" : "B";
    storage.setItem(key, variant);
    return { variant, headline: variant === "B" ? variantHeadline : "" };
  } catch (error) {
    console.warn("Could not persist the campaign headline test assignment.", error);
    return { variant: "A", headline: "" };
  }
}

export function getExperimentVisitorId(storage) {
  try {
    const saved = storage.getItem(EXPERIMENT_VISITOR_KEY);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const visitorId = window.crypto.randomUUID();
    storage.setItem(EXPERIMENT_VISITOR_KEY, visitorId);
    return visitorId;
  } catch (error) {
    console.warn("Could not persist the anonymous headline-test visitor ID.", error);
    try {
      return window.crypto.randomUUID();
    } catch (cryptoError) {
      console.error("Could not create an anonymous headline-test visitor ID.", cryptoError);
      return "";
    }
  }
}
