async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

export const api = {
  getProducts: () => request("/products"),
  getLandingPage: (slug) => request(`/landing-pages/${encodeURIComponent(slug)}`),
  getAdminPages: () => request("/admin/landing-pages"),
  saveLandingPage: (page, id) =>
    request(id ? `/admin/landing-pages/${id}` : "/admin/landing-pages", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(page),
    }),
  getOrders: () => request("/admin/orders"),
  createOrder: (order) =>
    request("/orders", {
      method: "POST",
      body: JSON.stringify(order),
    }),
};
