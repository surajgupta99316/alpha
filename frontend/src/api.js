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
  getStoreProducts: (params = {}) => request(`/store/products?${new URLSearchParams(params)}`),
  getStoreProduct: (slug) => request(`/store/products/${encodeURIComponent(slug)}`),
  checkPincode: (pincode) => request(`/serviceability/${encodeURIComponent(pincode)}`),
  getCoupons: () => request("/coupons"),
  validateCoupon: (code, subtotal) =>
    request("/coupons/validate", { method: "POST", body: JSON.stringify({ code, subtotal }) }),
  requestOtp: (phone) =>
    request("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: (phone, code) =>
    request("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code }) }),
  getMyAccount: (token) => request("/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
  getMyOrders: (token) => request("/auth/orders", { headers: { Authorization: `Bearer ${token}` } }),
  createCheckoutOrder: (order, token) =>
    request("/store/checkout", {
      method: "POST",
      body: JSON.stringify(order),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    }),
  getPaymentSummary: (order, token) =>
    request("/payments/order-details", {
      method: "POST",
      body: JSON.stringify(order),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    }),
  createRazorpayOrder: (order, token) =>
    request("/payments/razorpay/order", {
      method: "POST",
      body: JSON.stringify(order),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    }),
  verifyRazorpayPayment: (payment, token) =>
    request("/payments/razorpay/verify", {
      method: "POST",
      body: JSON.stringify(payment),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    }),
  confirmCashOnDelivery: (order, token) =>
    request("/payments/cod/confirm", {
      method: "POST",
      body: JSON.stringify(order),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    }),
  getAdminCoupons: () => request("/admin/coupons"),
  saveAdminCoupon: (coupon, id) =>
    request(id ? `/admin/coupons/${id}` : "/admin/coupons", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(coupon),
    }),
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
