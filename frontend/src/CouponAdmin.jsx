import { useEffect, useState } from "react";
import { api } from "./api.js";

function couponForm(coupon) {
  return {
    code: coupon?.code || "",
    type: coupon?.type || "percentage",
    value: coupon?.value ?? 10,
    minimumOrderValue: coupon?.minimumOrderValue ?? 499,
    expiresAt: coupon?.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 10) : "",
    usageLimit: coupon?.usageLimit ?? 100,
    active: coupon?.active ?? true,
  };
}

export default function CouponAdmin({ navigate }) {
  const [coupons, setCoupons] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(() => couponForm());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadCoupons() {
    setLoading(true);
    try {
      setCoupons(await api.getAdminCoupons());
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  function startNew() {
    setSelected(null);
    setForm(couponForm());
    setError("");
    setNotice("");
  }

  async function saveCoupon(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const expiresAt = new Date(`${form.expiresAt}T23:59:59.999`);
      await api.saveAdminCoupon({ ...form, expiresAt: expiresAt.toISOString() }, selected);
      await loadCoupons();
      setNotice(selected ? "Coupon updated." : "Coupon created.");
      setSelected(null);
      setForm(couponForm());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>ALPHA<span>MALE</span></a>
        <div className="admin-title"><span>STORE MANAGEMENT</span><strong>Module 02 · Coupons</strong></div>
        <div className="admin-header-links">
          <a className="admin-preview-link" href="/admin" onClick={(event) => { event.preventDefault(); navigate("/admin"); }}>Campaign studio</a>
          <a className="admin-preview-link" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>View storefront ↗</a>
        </div>
      </header>
      <div className="admin-content coupon-admin-content">
        <div className="admin-heading">
          <div><p className="section-kicker">PROMOTIONS DESK</p><h1>Offers that<br /><em>make it easy.</em></h1></div>
          <button className="button button-dark" onClick={startNew} type="button">+ New coupon</button>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        <div className="coupon-admin-grid">
          <section className="coupon-list-panel">
            <div className="list-heading"><span>COUPON CODES</span><span>{coupons.length} TOTAL</span></div>
            {loading ? <p className="admin-loading">Loading coupon codes…</p> : coupons.map((coupon) => (
              <button
                className={`coupon-list-item ${selected === coupon._id ? "selected" : ""}`}
                key={coupon._id}
                onClick={() => { setSelected(coupon._id); setForm(couponForm(coupon)); setNotice(""); }}
                type="button"
              >
                <span className="coupon-list-badge">%</span>
                <span className="coupon-list-copy"><strong>{coupon.code}</strong><small>{coupon.type === "percentage" ? `${coupon.value}% off` : `₹${coupon.value} off`} · {coupon.usageCount}/{coupon.usageLimit} used</small></span>
                <span className={`status-pill ${coupon.active ? "published" : "draft"}`}>{coupon.active ? "ACTIVE" : "PAUSED"}</span>
              </button>
            ))}
          </section>
          <form className="editor-form coupon-editor-form" onSubmit={saveCoupon}>
            <div className="editor-heading">
              <div><span className="section-kicker">{selected ? "EDIT COUPON" : "NEW COUPON"}</span><h2>{selected ? "Tune the offer." : "Create an offer."}</h2></div>
              <label className="publish-toggle"><input checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /><span>{form.active ? "Active" : "Paused"}</span></label>
            </div>
            <label>Coupon code<input autoCapitalize="characters" maxLength="30" onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} pattern="[A-Za-z0-9_-]{3,30}" required value={form.code} placeholder="WELCOME10" /></label>
            <div className="admin-form-row">
              <label>Discount type<select onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} value={form.type}><option value="percentage">Percentage</option><option value="flat">Flat amount</option></select></label>
              <label>{form.type === "percentage" ? "Discount percentage" : "Discount amount (₹)"}<input max={form.type === "percentage" ? 100 : undefined} min="1" onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} required type="number" value={form.value} /></label>
            </div>
            <div className="admin-form-row">
              <label>Minimum order (₹)<input min="0" onChange={(event) => setForm((current) => ({ ...current, minimumOrderValue: event.target.value }))} required type="number" value={form.minimumOrderValue} /></label>
              <label>Usage limit<input min="1" onChange={(event) => setForm((current) => ({ ...current, usageLimit: event.target.value }))} required type="number" value={form.usageLimit} /></label>
            </div>
            <label>Expiry date<input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} required type="date" value={form.expiresAt} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-dark" disabled={saving} type="submit">{saving ? "Saving…" : selected ? "Save coupon" : "Create coupon"} <span aria-hidden="true">↗</span></button>
          </form>
        </div>
      </div>
    </main>
  );
}
