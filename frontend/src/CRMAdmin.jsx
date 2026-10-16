import { useEffect, useState } from "react";
import { api } from "./api.js";
import "./crm.css";

const STAFF_TOKEN_KEY = "alpha:staff-token";
const LEAD_STATUSES = ["New", "Contacted", "Interested", "Converted", "Lost"];
const money = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

function StaffLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api.loginStaff({ email, password });
      window.localStorage.setItem(STAFF_TOKEN_KEY, result.token);
      onLogin(result.staff);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-shell">
      <div className="admin-content">
        <p className="section-kicker">STAFF PORTAL</p>
        <h1>Sign in to <em>Alpha Male.</em></h1>
        <form className="crm-form" onSubmit={submit}>
          <label>Email<input autoComplete="username" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>Password<input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="button button-dark" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"} ↗</button>
        </form>
      </div>
    </main>
  );
}

export function StaffGate({ path, navigate, children }) {
  const [staff, setStaff] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const token = window.localStorage.getItem(STAFF_TOKEN_KEY);
    if (!token) {
      setChecking(false);
      return;
    }
    api.getStaffMe()
      .then(({ staff: current }) => setStaff(current))
      .catch(() => window.localStorage.removeItem(STAFF_TOKEN_KEY))
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!staff || staff.role === "admin") return;
    const permitted = staff.role === "operations"
      ? ["/admin/orders", "/admin/fulfilment", "/admin/returns"].includes(path)
      : ["/admin/support", "/admin/crm", "/admin/leads", "/admin/abandoned-carts"].includes(path);
    if (!permitted) navigate(staff.role === "operations" ? "/admin/fulfilment" : "/admin/crm");
  }, [staff, path, navigate]);
  if (checking) return <main className="admin-shell"><p className="admin-loading">Checking staff session…</p></main>;
  if (!staff) return <StaffLogin onLogin={setStaff} />;
  const permitted = staff.role === "admin" || (staff.role === "operations"
    ? ["/admin/orders", "/admin/fulfilment", "/admin/returns"].includes(path)
    : ["/admin/support", "/admin/crm", "/admin/leads", "/admin/abandoned-carts"].includes(path));
  if (!permitted) return <main className="admin-shell"><p className="admin-loading">Opening your staff workspace…</p></main>;
  return (
    <>
      <div className="crm-session">
        <span>{staff.fullName} · {staff.role.replace("_", " ")}</span>
        <button onClick={() => { window.localStorage.removeItem(STAFF_TOKEN_KEY); setStaff(null); navigate("/admin"); }} type="button">Sign out</button>
      </div>
      {children}
    </>
  );
}

function CrmHeader({ navigate, title }) {
  return (
    <header className="admin-header">
      <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>ALPHA<span>MALE</span></a>
      <div className="admin-title"><span>MODULE 06 · CUSTOMER OPERATIONS</span><strong>{title}</strong></div>
      <nav className="admin-header-links" aria-label="Staff workspace">
        {[["/admin/crm", "Customers"], ["/admin/leads", "Leads"], ["/admin/abandoned-carts", "Carts"], ["/admin/analytics", "Analytics"], ["/admin/products", "Products"], ["/admin/reviews", "Reviews"], ["/admin/staff", "Staff"]].map(([href, label]) => (
          <a className="admin-preview-link" href={href} key={href} onClick={(event) => { event.preventDefault(); navigate(href); }}>{label}</a>
        ))}
      </nav>
    </header>
  );
}

function CsvActions({ types, setError }) {
  async function downloadCsv(type) {
    try {
      const blob = await api.exportCsv(type);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `alpha-${type}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(error.message);
    }
  }
  return <div className="crm-actions">{types.map((type) => <button key={type} onClick={() => downloadCsv(type)} type="button">Export {type} CSV ↓</button>)}</div>;
}

function CustomerWorkspace({ error, setError }) {
  const [customers, setCustomers] = useState([]);
  const [segments, setSegments] = useState([]);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("");
  const [customer, setCustomer] = useState(null);
  const [profile, setProfile] = useState(null);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  async function load() {
    const [rows, groups] = await Promise.all([api.getCrmCustomers(search, segment), api.getCustomerSegments()]);
    setCustomers(rows);
    setSegments(groups);
  }
  useEffect(() => { load().catch((requestError) => setError(requestError.message)); }, [search, segment]);
  async function openCustomer(row) {
    setCustomer(row);
    setError("");
    try {
      const result = await api.getCustomer360(row._id);
      setProfile(result);
      setTags((result.customer.tags || []).join(", "));
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  async function saveNote(event) {
    event.preventDefault();
    try {
      await api.updateCustomerCrm(customer._id, { action: "note", body: note });
      setNote("");
      await openCustomer(customer);
    } catch (requestError) { setError(requestError.message); }
  }
  async function saveTags(event) {
    event.preventDefault();
    try {
      await api.updateCustomerCrm(customer._id, { action: "tags", tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
      await openCustomer(customer);
      await load();
    } catch (requestError) { setError(requestError.message); }
  }
  return (
    <>
      <div className="crm-segments">{segments.map((segment) => <div className="crm-segment" key={segment.id}><strong>{segment.count}</strong><span>{segment.label}</span></div>)}</div>
      <CsvActions setError={setError} types={["customers", "leads"]} />
      <div className="crm-layout">
        <section className="crm-panel">
          <label className="crm-search">Find a customer<input onChange={(event) => setSearch(event.target.value)} placeholder="Name, email or mobile" value={search} /></label>
          <label className="crm-search">Segment<select onChange={(event) => setSegment(event.target.value)} value={segment}><option value="">All customers</option>{segments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <div className="crm-customer-list">{customers.map((row) => <button className={customer?._id === row._id ? "selected" : ""} key={row._id} onClick={() => openCustomer(row)} type="button"><strong>{row.fullName || "Customer"}</strong><span>{row.phone}</span><small>{(row.tags || []).join(" · ")}</small></button>)}</div>
        </section>
        <section className="crm-panel crm-profile">
          {!profile ? <p>Select a customer to view their profile.</p> : <>
            <p className="section-kicker">CUSTOMER 360</p><h2>{profile.customer.fullName || "Customer"}</h2>
            <p>{profile.customer.phone} · {profile.customer.email || "No email"}</p>
            <p>First touch: {[profile.customer.firstUtm?.source, profile.customer.firstUtm?.medium, profile.customer.firstUtm?.campaign].filter(Boolean).join(" / ") || "Direct / not recorded"}</p>
            {profile.customer.totalSpent !== undefined && <p>{money(profile.customer.totalSpent)} lifetime · {profile.customer.orderCount} orders · {profile.customer.loyaltyPoints} loyalty points · referral {profile.customer.referralCode || "—"}</p>}
            <form className="crm-inline-form" onSubmit={saveTags}><label>Tags<input onChange={(event) => setTags(event.target.value)} value={tags} /></label><button type="submit">Save tags</button></form>
            <div className="crm-order-list"><h3>Orders</h3>{profile.orders.map((order) => <article key={order._id}><strong>{order.orderNumber}</strong><span>{order.status} · {order.fulfillmentStatus}</span>{order.amount !== undefined && <b>{money(order.amount)}</b>}</article>)}</div>
            <div className="crm-order-list"><h3>Returns and support</h3>{[...profile.returns, ...profile.tickets].map((item) => <article key={item._id}><strong>{item.returnNumber || item.ticketNumber}</strong><span>{item.reason || item.subject} · {item.status}</span></article>)}</div>
            <div className="crm-order-list"><h3>Team notes</h3>{profile.customer.teamNotes.map((item) => <article key={`${item.createdAt}-${item.body}`}><span>{item.body}</span><small>{item.author} · {new Date(item.createdAt).toLocaleString()}</small></article>)}</div>
            <form className="crm-inline-form" onSubmit={saveNote}><label>Add a team note<textarea maxLength="1000" onChange={(event) => setNote(event.target.value)} required value={note} /></label><button type="submit">Add note</button></form>
          </>}
        </section>
      </div>
    </>
  );
}

function LeadsBoard({ setError }) {
  const [leads, setLeads] = useState([]);
  async function load() { setLeads(await api.getLeads()); }
  useEffect(() => { load().catch((error) => setError(error.message)); }, []);
  async function move(lead, status) {
    try { await api.updateLead(lead._id, { status }); await load(); }
    catch (error) { setError(error.message); }
  }
  return <><CsvActions setError={setError} types={["leads"]} /><div className="crm-kanban">{LEAD_STATUSES.map((status) => <section className="crm-kanban-column" key={status}><h2>{status}<span>{leads.filter((lead) => lead.status === status).length}</span></h2>{leads.filter((lead) => lead.status === status).map((lead) => <article className="crm-lead-card" key={lead._id}><strong>{lead.fullName}</strong><a href={`tel:${lead.phone}`}>{lead.phone}</a>{lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}<p>{lead.message || "Callback request"}</p><small>{lead.utm?.source || "Direct"}{lead.utm?.campaign ? ` · ${lead.utm.campaign}` : ""}</small><select aria-label={`Move ${lead.fullName} to another lead status`} onChange={(event) => move(lead, event.target.value)} value={status}>{LEAD_STATUSES.map((state) => <option key={state}>{state}</option>)}</select></article>)}</section>)}</div></>;
}

function AbandonedCartList({ setError }) {
  const [carts, setCarts] = useState([]);
  async function load() { setCarts(await api.getAbandonedCarts()); }
  useEffect(() => { load().catch((error) => setError(error.message)); }, []);
  async function update(cart, status) {
    try { await api.updateAbandonedCart(cart._id, status); await load(); }
    catch (error) { setError(error.message); }
  }
  return <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Customer</th><th>Order</th><th>Contact</th><th>Items</th><th>Status</th><th>Email</th></tr></thead><tbody>{carts.map((cart) => <tr key={cart._id}><td>{cart.fullName}</td><td>{cart.orderNumber}</td><td><a href={`tel:${cart.phone}`}>{cart.phone}</a><br />{cart.email}</td><td>{cart.items?.map((item) => `${item.name} × ${item.quantity}`).join(", ") || "—"}</td><td><select onChange={(event) => update(cart, event.target.value)} value={cart.status}>{["pending", "contacted", "converted"].map((status) => <option key={status}>{status}</option>)}</select></td><td>{cart.emailStatus}</td></tr>)}</tbody></table></div>;
}

function ReviewsList({ setError }) {
  const [reviews, setReviews] = useState([]);
  async function load() { setReviews(await api.getReviews()); }
  useEffect(() => { load().catch((error) => setError(error.message)); }, []);
  async function moderate(review, status) {
    try { await api.moderateReview(review._id, status); await load(); }
    catch (error) { setError(error.message); }
  }
  return <div className="crm-review-list">{reviews.map((review) => <article className="crm-panel" key={review._id}><div><strong>{review.product?.name} · {review.rating}/5</strong><span>{review.status} · {review.customerName} · {review.orderNumber}</span></div><h3>{review.title || "Customer review"}</h3><p>{review.body}</p>{review.status === "pending" && <div className="crm-actions"><button onClick={() => moderate(review, "approved")} type="button">Approve</button><button onClick={() => moderate(review, "rejected")} type="button">Reject</button></div>}</article>)}</div>;
}

function Analytics({ setError }) {
  const [data, setData] = useState(null);
  const [range, setRange] = useState({ from: "", to: "" });
  useEffect(() => {
    api.getCrmDashboard(Object.fromEntries(Object.entries(range).filter(([, value]) => value)))
      .then(setData).catch((error) => setError(error.message));
  }, [range]);
  if (!data) return <p className="admin-loading">Loading analytics…</p>;
  return <>
    <div className="crm-actions"><label>From <input onChange={(event) => setRange((old) => ({ ...old, from: event.target.value }))} type="date" value={range.from} /></label><label>To <input onChange={(event) => setRange((old) => ({ ...old, to: event.target.value }))} type="date" value={range.to} /></label><CsvActions setError={setError} types={["orders"]} /></div>
    <div className="crm-kpis">{Object.entries({ Revenue: money(data.summary.revenue), Orders: data.summary.orders, "Average order": money(data.summary.aov), "Repeat customers": `${data.summary.repeatCustomerRate}%`, "RTO rate": `${data.summary.rtoRate}%` }).map(([label, value]) => <article className="crm-panel" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div className="crm-panel"><h2>Campaign performance</h2><div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Campaign</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.campaign}><td>{row.campaign}</td><td>{row.orders}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></div>
    <div className="crm-panel"><h2>Headline A/B test</h2><p>Unique browser impressions, submitted order requests, confirmed purchases, and purchase conversion rate per campaign.</p><div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Campaign</th><th>Variant</th><th>Impressions</th><th>Order requests</th><th>Purchases</th><th>Purchase rate</th><th>Revenue</th></tr></thead><tbody>{data.headlineVariants.map((row) => <tr key={`${row.campaign}-${row.variant}`}><td>{row.campaign}</td><td>Headline {row.variant}</td><td>{row.impressions}</td><td>{row.orders}</td><td>{row.conversions}</td><td>{row.conversionRate}%</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></div>
    <div className="crm-panel"><h2>Daily revenue</h2><div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>{data.daily.map((row) => <tr key={row._id}><td>{row._id}</td><td>{row.orders}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></div>
  </>;
}

const emptyProduct = { name: "", slug: "", category: "Eau de Parfum", description: "", price: "", mrp: "", stock: "", imageUrl: "", hsnCode: "33030020", lowStockThreshold: "10", active: true };
function ProductInventory({ setError, setNotice }) {
  const [data, setData] = useState({ products: [], lowStock: [] });
  const [form, setForm] = useState(emptyProduct);
  const [selected, setSelected] = useState("");
  async function load() { setData(await api.getCrmProducts()); }
  useEffect(() => { load().catch((error) => setError(error.message)); }, []);
  function select(product) { setSelected(product._id); setForm({ ...product, price: String(product.price), mrp: String(product.mrp), stock: String(product.stock), lowStockThreshold: String(product.lowStockThreshold) }); }
  async function submit(event) {
    event.preventDefault();
    setError(""); setNotice("");
    try {
      const result = await api.saveCrmProduct({ ...form, price: Number(form.price), mrp: Number(form.mrp), stock: Number(form.stock), lowStockThreshold: Number(form.lowStockThreshold) }, selected);
      setNotice(`${result.name} saved.`);
      setSelected("");
      setForm(emptyProduct);
      await load();
    } catch (error) { setError(error.message); }
  }
  return <div className="crm-layout"><section className="crm-panel"><h2>Product stock</h2><p>{data.lowStock.length} product(s) at or below low-stock threshold.</p>{data.products.map((product) => <button className="crm-product-row" key={product._id} onClick={() => select(product)} type="button"><strong>{product.name}</strong><span>{product.stock} in stock · alert at {product.lowStockThreshold}</span>{product.stock <= product.lowStockThreshold && <b>LOW STOCK</b>}</button>)}</section><form className="crm-panel crm-form" onSubmit={submit}><h2>{selected ? "Edit product" : "Add product"}</h2>{[["name", "Name"], ["slug", "Slug"], ["category", "Category"], ["description", "Description"], ["imageUrl", "Image URL"], ["price", "Price"], ["mrp", "MRP"], ["stock", "Stock"], ["lowStockThreshold", "Low-stock threshold"], ["hsnCode", "HSN code"]].map(([key, label]) => <label key={key}>{label}<input min={["price", "mrp", "stock", "lowStockThreshold"].includes(key) ? 0 : undefined} onChange={(event) => setForm((old) => ({ ...old, [key]: event.target.value }))} required step={["price", "mrp", "stock", "lowStockThreshold"].includes(key) ? 1 : undefined} type={["price", "mrp", "stock", "lowStockThreshold"].includes(key) ? "number" : "text"} value={form[key]} /></label>)}<label><input checked={form.active} onChange={(event) => setForm((old) => ({ ...old, active: event.target.checked }))} type="checkbox" /> Available in storefront</label><div className="crm-actions"><button className="button button-dark" type="submit">Save product</button><button onClick={() => { setSelected(""); setForm(emptyProduct); }} type="button">Clear</button></div></form></div>;
}

function StaffUsers({ setError, setNotice }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "sales_support" });
  async function load() { setStaff(await api.getStaffUsers()); }
  useEffect(() => { load().catch((error) => setError(error.message)); }, []);
  async function submit(event) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      await api.createStaffUser(form);
      setForm({ fullName: "", email: "", password: "", role: "sales_support" });
      setNotice("Staff account created.");
      await load();
    } catch (error) { setError(error.message); }
  }
  async function toggle(user) {
    setError(""); setNotice("");
    try {
      await api.setStaffActive(user._id, !user.active);
      setNotice(`${user.fullName} is now ${user.active ? "inactive" : "active"}.`);
      await load();
    } catch (error) { setError(error.message); }
  }
  return <div className="crm-layout"><section className="crm-panel"><h2>Staff accounts</h2>{staff.map((user) => <article className="crm-staff-row" key={user._id}><strong>{user.fullName}</strong><span>{user.email} · {user.role} · {user.active ? "Active" : "Inactive"}</span><button onClick={() => toggle(user)} type="button">{user.active ? "Deactivate" : "Activate"}</button></article>)}</section><form className="crm-panel crm-form" onSubmit={submit}><h2>Create staff login</h2><label>Full name<input onChange={(event) => setForm((old) => ({ ...old, fullName: event.target.value }))} required value={form.fullName} /></label><label>Email<input onChange={(event) => setForm((old) => ({ ...old, email: event.target.value }))} required type="email" value={form.email} /></label><label>Password<input autoComplete="new-password" minLength="12" onChange={(event) => setForm((old) => ({ ...old, password: event.target.value }))} required type="password" value={form.password} /><small>At least 12 characters with upper/lowercase, a number, and a symbol.</small></label><label>Role<select onChange={(event) => setForm((old) => ({ ...old, role: event.target.value }))} value={form.role}><option value="sales_support">Sales / Support</option><option value="operations">Operations</option><option value="admin">Admin</option></select></label><button className="button button-dark" type="submit">Create account</button></form></div>;
}

export default function CRMAdmin({ mode, navigate }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const titles = { customers: "Customer 360", leads: "Callback leads", carts: "Abandoned carts", analytics: "Analytics", products: "Products and stock", reviews: "Review moderation", staff: "Staff accounts" };
  const title = titles[mode] || "Customer operations";
  return (
    <main className="admin-shell">
      <CrmHeader navigate={navigate} title={title} />
      <div className="admin-content">
        <div className="admin-heading"><div><p className="section-kicker">CUSTOMER RELATIONSHIP DESK</p><h1>{title.split(" ").slice(0, -1).join(" ")} <em>{title.split(" ").slice(-1)}</em></h1></div><a className="text-link" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>View storefront ↗</a></div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        {mode === "customers" && <CustomerWorkspace error={error} setError={setError} />}
        {mode === "leads" && <LeadsBoard setError={setError} />}
        {mode === "carts" && <AbandonedCartList setError={setError} />}
        {mode === "analytics" && <Analytics setError={setError} />}
        {mode === "products" && <ProductInventory setError={setError} setNotice={setNotice} />}
        {mode === "reviews" && <ReviewsList setError={setError} />}
        {mode === "staff" && <StaffUsers setError={setError} setNotice={setNotice} />}
      </div>
    </main>
  );
}
