const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_URL || "";
async function request(path, options = {}) {
  const staffToken = window.localStorage.getItem("alpha:staff-token");
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(path.startsWith("/admin/") && staffToken ? { Authorization: `Bearer ${staffToken}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

async function download(path, options = {}) {
  const staffToken = window.localStorage.getItem("alpha:staff-token");
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(path.startsWith("/admin/") && staffToken ? { Authorization: `Bearer ${staffToken}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "The download could not be completed.");
  }
  return response.blob();
}

export const api = {
  loginStaff: (credentials) => request("/staff/login", { method: "POST", body: JSON.stringify(credentials) }),
  getStaffMe: () => request("/staff/me", { headers: { Authorization: `Bearer ${window.localStorage.getItem("alpha:staff-token") || ""}` } }),
  getCrmDashboard: (filters = {}) => request(`/admin/crm/dashboard?${new URLSearchParams(filters)}`),
  getCrmCustomers: (search = "", segment = "") => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (segment) params.set("segment", segment);
    return request(`/admin/crm/customers${params.size ? `?${params}` : ""}`);
  },
  getCustomer360: (id) => request(`/admin/crm/customers/${encodeURIComponent(id)}`),
  updateCustomerCrm: (id, update) => request(`/admin/crm/customers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(update) }),
  getCustomerSegments: () => request("/admin/crm/segments"),
  getLeads: () => request("/admin/crm/leads"),
  updateLead: (id, update) => request(`/admin/crm/leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(update) }),
  getAbandonedCarts: () => request("/admin/crm/abandoned-carts"),
  updateAbandonedCart: (id, status) => request(`/admin/crm/abandoned-carts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getReviews: () => request("/admin/crm/reviews"),
  moderateReview: (id, status, moderationNote = "") => request(`/admin/crm/reviews/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, moderationNote }) }),
  getCrmProducts: () => request("/admin/crm/products"),
  saveCrmProduct: (product, id) => request(id ? `/admin/crm/products/${encodeURIComponent(id)}` : "/admin/crm/products", { method: id ? "PUT" : "POST", body: JSON.stringify(product) }),
  getStaffUsers: () => request("/admin/staff"),
  createStaffUser: (staff) => request("/admin/staff", { method: "POST", body: JSON.stringify(staff) }),
  setStaffActive: (id, active) => request(`/admin/staff/${encodeURIComponent(id)}/active`, { method: "PATCH", body: JSON.stringify({ active }) }),
  exportCsv: (type) => download(`/admin/export/${encodeURIComponent(type)}.csv`),
  createLead: (lead) => request("/leads", { method: "POST", body: JSON.stringify(lead) }),
  getProductReviews: (slug) => request(`/reviews/products/${encodeURIComponent(slug)}`),
  submitProductReview: (review) => request("/reviews", { method: "POST", body: JSON.stringify(review) }),
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
  trackOrder: (details) =>
    request("/tracking", { method: "POST", body: JSON.stringify(details) }),
  requestReturn: (details) =>
    request("/returns", { method: "POST", body: JSON.stringify(details) }),
  createSupportTicket: (ticket) =>
    request("/support/tickets", { method: "POST", body: JSON.stringify(ticket) }),
  getReturnRequests: (status = "") =>
    request(`/admin/post-purchase/returns${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  updateReturnRequest: (id, update) =>
    request(`/admin/post-purchase/returns/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    }),
  getSupportTickets: (status = "") =>
    request(`/admin/post-purchase/tickets${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  updateSupportTicket: (id, update) =>
    request(`/admin/post-purchase/tickets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    }),
  getNotificationLogs: () => request("/admin/post-purchase/notifications"),
  retryNotification: (id) =>
    request(`/admin/post-purchase/notifications/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  getAdminCoupons: () => request("/admin/coupons"),
  saveAdminCoupon: (coupon, id) =>
    request(id ? `/admin/coupons/${id}` : "/admin/coupons", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(coupon),
    }),
  getLandingPage: (slug) => request(`/landing-pages/${encodeURIComponent(slug)}`),
  recordHeadlineExposure: (exposure) =>
    request("/campaign-experiments/exposure", { method: "POST", body: JSON.stringify(exposure) }),
  getAdminPages: () => request("/admin/landing-pages"),
  saveLandingPage: (page, id) =>
    request(id ? `/admin/landing-pages/${id}` : "/admin/landing-pages", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(page),
    }),
  getOrders: () => request("/admin/orders"),
  getFulfilmentOrders: (filters) =>
    request(`/admin/fulfilment/orders?${new URLSearchParams(filters)}`),
  getFulfilmentOrder: (id) => request(`/admin/fulfilment/orders/${encodeURIComponent(id)}`),
  updateFulfilmentStatus: (id, status, actor, note = "") =>
    request(`/admin/fulfilment/orders/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, actor, note }),
    }),
  addFulfilmentNote: (id, body, author) =>
    request(`/admin/fulfilment/orders/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      body: JSON.stringify({ body, author }),
    }),
  bookShipment: (id, weightKg, actor) =>
    request(`/admin/fulfilment/orders/${encodeURIComponent(id)}/shipment`, {
      method: "POST",
      body: JSON.stringify({ weightKg, actor }),
    }),
  resolveNdr: (id, action, actor) =>
    request(`/admin/fulfilment/orders/${encodeURIComponent(id)}/ndr`, {
      method: "POST",
      body: JSON.stringify({ action, actor }),
    }),
  downloadFulfilmentPdf: (type, orderIds) =>
    download("/admin/fulfilment/bulk/print", {
      method: "POST",
      body: JSON.stringify({ type, orderIds }),
    }),
  downloadPackingList: (orderIds) =>
    download("/admin/fulfilment/bulk/pick-list", {
      method: "POST",
      body: JSON.stringify({ orderIds }),
    }),
  packFulfilmentOrders: (orderIds, actor) =>
    request("/admin/fulfilment/bulk/pack", {
      method: "POST",
      body: JSON.stringify({ orderIds, actor }),
    }),
  downloadManifest: (orderIds) =>
    download("/admin/fulfilment/bulk/manifest", {
      method: "POST",
      body: JSON.stringify({ orderIds }),
    }),
  downloadOrderPdf: (id, type) =>
    download(`/admin/fulfilment/orders/${encodeURIComponent(id)}/${type}.pdf`),
  createOrder: (order) =>
    request("/orders", {
      method: "POST",
      body: JSON.stringify(order),
    }),
};
