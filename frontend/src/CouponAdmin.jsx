import { useEffect, useState } from "react";
import { api } from "./api.js";

function defaultExpiry() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

const blankCoupon = () => ({
  code: "",
  type: "percentage",
  value: 10,
  minimumOrderValue: 499,
  usageLimit: 100,
  expiresAt: defaultExpiry(),
  active: true,
});

export default function CouponAdmin({ navigate }) {
  const [coupons, setCoupons] = useState([]);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState(blankCoupon);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadCoupons() {
    try {
      setCoupons(await api.getAdminCoupons());
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => { loadCoupons(); }, []);

  function edit(coupon) {
    setSelected(coupon._id);
    setNotice("");
    setError("");
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minimumOrderValue: coupon.minimumOrderValue,
      usageLimit: coupon.usageLimit,
      expiresAt: new Date(coupon.expiresAt).toISOString().slice(0, 10),
      active: coupon.active,
    });
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await api.saveAdminCoupon({ ...form, expiresAt: new Date(`${form.expiresAt}T23:59:59`).toISOString() }, selected || undefined);
      await loadCoupons();
      setSelected(saved._id);
      setNotice(selected ? "Coupon updated." : "Coupon created.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="coupon-admin-shell">
      <header className="store-header">
        <a className="store-wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>ALPHA<span>MALE</span></a>
        <div className="coupon-admin-title">STORE MANAGEMENT<br /><strong>Module 02 · Coupons</strong></div>
        <div className="coupon-admin-links"><a href="/admin" onClick={(event) => { event.preventDefault(); navigate("/admin"); }}>Campaign studio</a><a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>View storefront ↗</a></div>
      </header>
      <section className="coupon-admin-content">
        <div className="coupon-admin-heading"><div><p className="store-eyebrow">PROMOTIONS DESK</p><h1>Offers that<br /><em>make it easy.</em></h1></div><button className="store-button store-button-dark" onClick={() => { setSelected(""); setForm(blankCoupon()); setError(""); setNotice(""); }} type="button">+ New coupon</button></div>
        {error && <p className="store-error" role="alert">{error}</p>}
        <div className="coupon-admin-layout">
          <aside className="coupon-list"><p>COUPON CODES <span>{coupons.length} TOTAL</span></p>{coupons.map((coupon) => <button className={selected === coupon._id ? "selected" : ""} key={coupon._id} onClick={() => edit(coupon)} type="button"><span className="coupon-symbol">%</span><span><strong>{coupon.code}</strong><small>{coupon.type === "percentage" ? `${coupon.value}% off` : `₹${coupon.value} off`} · {coupon.usageCount}/{coupon.usageLimit} used</small></span><span className={coupon.active ? "coupon-active" : "coupon-inactive"}>{coupon.active && new Date(coupon.expiresAt) > new Date() && coupon.usageCount < coupon.usageLimit ? "ACTIVE" : "INACTIVE"}</span></button>)}</aside>
          <form className="coupon-form-admin" onSubmit={save}>
            <div className="coupon-form-title"><div><p>{selected ? "EDIT COUPON" : "NEW COUPON"}</p><h2>{selected ? "Refine your offer." : "Create an offer."}</h2></div><label className="coupon-active-toggle"><input checked={form.active} name="active" onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /> Active</label></div>
            <label>Coupon code<input autoCapitalize="characters" maxLength="30" onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} pattern="[A-Z0-9_-]{3,30}" required value={form.code} placeholder="WELCOME10" /></label>
            <div className="coupon-form-row"><label>Discount type<select onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} value={form.type}><option value="percentage">Percentage</option><option value="flat">Flat amount</option></select></label><label>{form.type === "percentage" ? "Discount percentage" : "Discount amount (₹)"}<input max={form.type === "percentage" ? 100 : undefined} min="1" onChange={(event) => setForm((current) => ({ ...current, value: Number(event.target.value) }))} required type="number" value={form.value} /></label></div>
            <div className="coupon-form-row"><label>Minimum order (₹)<input min="0" onChange={(event) => setForm((current) => ({ ...current, minimumOrderValue: Number(event.target.value) }))} required type="number" value={form.minimumOrderValue} /></label><label>Usage limit<input min={selected ? coupons.find((coupon) => coupon._id === selected)?.usageCount || 1 : 1} onChange={(event) => setForm((current) => ({ ...current, usageLimit: Number(event.target.value) }))} required type="number" value={form.usageLimit} /></label></div>
            <label>Expiry date<input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} required type="date" value={form.expiresAt} /></label>
            {error && <p className="coupon-error" role="alert">{error}</p>}{notice && <p className="coupon-success" role="status">{notice}</p>}
            <button className="store-button store-button-dark" disabled={busy} type="submit">{busy ? "Saving…" : selected ? "Save changes" : "Create coupon"} <span>↗</span></button>
          </form>
        </div>
        <p className="coupon-admin-warning">Coupon admin routes are open for this local assignment. Add admin authentication before public deployment.</p>
      </section>
    </main>
  );
}
