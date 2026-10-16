import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import "./fulfilment.css";

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ["New", "Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered", "Cancelled", "RTO", "Returned"];
const NEXT_STATUSES = {
  New: ["Confirmed", "Cancelled"],
  Confirmed: ["Packed", "Cancelled"],
  Packed: ["Cancelled"],
  Delivered: ["Returned"],
  RTO: ["Returned"],
};
const money = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const dateTime = (value) => value
  ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
  : "—";

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function storedOperator() {
  try {
    return window.localStorage.getItem("alpha:operations-name") || "";
  } catch (error) {
    console.warn("Could not read the saved operations name.", error);
    return "";
  }
}

export default function FulfilmentAdmin({ navigate }) {
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    paymentMethod: "",
    from: "",
    to: "",
    campaignSource: "",
  });
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, pages: 0 });
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [nextStatus, setNextStatus] = useState("");
  const [operator, setOperator] = useState(storedOperator);
  const [note, setNote] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [weightKg, setWeightKg] = useState("0.25");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const query = useMemo(() => ({
    ...filters,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  }), [filters, page]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    api.getFulfilmentOrders(query)
      .then((result) => {
        if (!current) return;
        setOrders(result.orders);
        setPagination(result.pagination);
      })
      .catch((requestError) => {
        if (current) setError(requestError.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [query]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setNextStatus("");
      return undefined;
    }
    let current = true;
    api.getFulfilmentOrder(selectedOrderId)
      .then((order) => {
        if (current) {
          setSelectedOrder(order);
          setNextStatus((NEXT_STATUSES[order.fulfillmentStatus || "New"] || [])[0] || "");
        }
      })
      .catch((requestError) => {
        if (current) setError(requestError.message);
      });
    return () => { current = false; };
  }, [selectedOrderId]);

  function updateFilter(name, value) {
    setPage(1);
    setSelectedIds([]);
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function saveOperator(value) {
    setOperator(value);
    try {
      window.localStorage.setItem("alpha:operations-name", value);
    } catch (storageError) {
      console.warn("Could not save the operations name.", storageError);
    }
  }

  async function refreshOrder() {
    if (selectedOrderId) {
      const order = await api.getFulfilmentOrder(selectedOrderId);
      setSelectedOrder(order);
      setNextStatus((NEXT_STATUSES[order.fulfillmentStatus || "New"] || [])[0] || "");
    }
    const result = await api.getFulfilmentOrders(query);
    setOrders(result.orders);
    setPagination(result.pagination);
  }

  async function withBusy(action, successMessage) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (successMessage) setNotice(successMessage(result));
      try {
        await refreshOrder();
      } catch (refreshError) {
        setError(`The operation succeeded, but the order list could not refresh: ${refreshError.message}`);
      }
      return result;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function printBulk(type) {
    const blob = await withBusy(
      () => api.downloadFulfilmentPdf(type, selectedIds),
      () => `${type === "both" ? "Invoices and labels" : type === "labels" ? "Labels" : "Invoices"} PDF is ready.`,
    );
    if (blob) saveBlob(blob, `alpha-${type}.pdf`);
  }

  async function printPickList() {
    const blob = await withBusy(() => api.downloadPackingList(selectedIds), () => "Packing pick list PDF is ready.");
    if (blob) saveBlob(blob, "alpha-pick-list.pdf");
  }

  async function printManifest() {
    const blob = await withBusy(() => api.downloadManifest(selectedIds), () => "Courier manifest PDF is ready.");
    if (blob) saveBlob(blob, "alpha-courier-manifest.pdf");
  }

  async function printOne(type) {
    const blob = await withBusy(
      () => api.downloadOrderPdf(selectedOrderId, type),
      () => `${type === "invoice" ? "GST invoice" : "Shipping label"} PDF is ready.`,
    );
    if (blob) saveBlob(blob, `${selectedOrder?.orderNumber || "alpha-order"}-${type}.pdf`);
  }

  async function changeStatus(status) {
    await withBusy(
      () => api.updateFulfilmentStatus(selectedOrderId, status, operator, statusNote),
      () => `Order status updated to ${status}.`,
    );
    setStatusNote("");
  }

  async function addNote(event) {
    event.preventDefault();
    if (!selectedOrderId) return;
    const result = await withBusy(
      () => api.addFulfilmentNote(selectedOrderId, note, operator),
      () => "Internal note added.",
    );
    if (result) setNote("");
  }

  async function bookCourier() {
    await withBusy(
      () => api.bookShipment(selectedOrderId, Number(weightKg), operator),
      () => "Mock courier shipment booked and order marked Shipped.",
    );
  }

  async function resolveNdr(action) {
    await withBusy(
      () => api.resolveNdr(selectedOrderId, action, operator),
      () => action === "reattempt" ? "Courier reattempt requested." : "Return to origin requested.",
    );
  }

  async function packSelected() {
    const result = await withBusy(
      () => api.packFulfilmentOrders(selectedIds, operator),
      (response) => `${response.packed} order${response.packed === 1 ? "" : "s"} marked Packed.`,
    );
    if (result) setSelectedIds([]);
  }

  function toggleOrder(id) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  }

  function togglePageSelection(checked) {
    setSelectedIds((current) => {
      const otherPageIds = current.filter((id) => !orders.some((order) => order._id === id));
      return checked ? [...otherPageIds, ...orders.map((order) => order._id)] : otherPageIds;
    });
  }

  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedIds.includes(order._id));
  const nextStatuses = (NEXT_STATUSES[selectedOrder?.fulfillmentStatus || "New"] || [])
    .filter((status) => status !== "Confirmed" || ["Paid", "CODConfirmed", "New"].includes(selectedOrder?.status));

  return (
    <main className="fulfilment-shell">
      <header className="fulfilment-header">
        <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>ALPHA<span>MALE</span></a>
        <div className="fulfilment-title"><span>OPERATIONS DESK</span><strong>Module 04 · Fulfil</strong></div>
        <nav className="fulfilment-header-links" aria-label="Admin navigation">
          <a href="/admin" onClick={(event) => { event.preventDefault(); navigate("/admin"); }}>Campaigns</a>
          <a href="/admin/coupons" onClick={(event) => { event.preventDefault(); navigate("/admin/coupons"); }}>Coupons</a>
          <a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>Storefront ↗</a>
        </nav>
      </header>

      <div className="fulfilment-content">
        <div className="fulfilment-heading">
          <div><p className="section-kicker">THE DAILY SHIPPING DESK</p><h1>Orders, packed<br /><em>and on their way.</em></h1></div>
          <label className="operator-field">OPERATOR NAME<input maxLength="100" onChange={(event) => saveOperator(event.target.value)} placeholder="Your name for the audit log" value={operator} /></label>
        </div>
        <div className="fulfilment-warning">
          <strong>Local assignment operations mode.</strong> Operator names are audit labels, not authenticated identities. Protect this admin page with staff login and role checks before deployment.
        </div>
        {error && <p className="fulfilment-error" role="alert">{error}</p>}
        {notice && <p className="fulfilment-notice" role="status">{notice}</p>}

        <section className="fulfilment-filters" aria-label="Filter orders">
          <label>Search order, customer or phone<input onChange={(event) => updateFilter("search", event.target.value)} placeholder="Order ID, name or mobile" value={filters.search} /></label>
          <label>Fulfilment status<select onChange={(event) => updateFilter("status", event.target.value)} value={filters.status}><option value="">All statuses</option>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Payment method<select onChange={(event) => updateFilter("paymentMethod", event.target.value)} value={filters.paymentMethod}><option value="">All methods</option><option value="prepaid">Prepaid</option><option value="cod">COD / partial COD</option></select></label>
          <label>Campaign source<input onChange={(event) => updateFilter("campaignSource", event.target.value)} placeholder="e.g. instagram" value={filters.campaignSource} /></label>
          <label>From<input onChange={(event) => updateFilter("from", event.target.value)} type="date" value={filters.from} /></label>
          <label>To<input onChange={(event) => updateFilter("to", event.target.value)} type="date" value={filters.to} /></label>
        </section>

        <section className="fulfilment-orders">
          <div className="fulfilment-list-heading"><div><p className="section-kicker">ORDERS QUEUE</p><h2>{pagination.total} <span>orders</span></h2></div><span>Page {pagination.page} of {Math.max(pagination.pages, 1)}</span></div>
          {selectedIds.length > 0 && <div className="fulfilment-bulk-bar">
            <strong>{selectedIds.length} selected</strong>
            <button disabled={busy} onClick={() => printBulk("invoices")} type="button">Print invoices</button>
            <button disabled={busy} onClick={() => printBulk("labels")} type="button">Print labels</button>
            <button disabled={busy} onClick={() => printBulk("both")} type="button">Invoices + labels</button>
            <button disabled={busy} onClick={printPickList} type="button">Packing list</button>
            <button disabled={busy} onClick={packSelected} type="button">Mark Packed</button>
            <button disabled={busy} onClick={printManifest} type="button">Manifest PDF</button>
          </div>}
          <div className="fulfilment-table-wrap">
            <table className="fulfilment-table">
              <thead><tr>
                <th><input aria-label="Select visible orders" checked={allVisibleSelected} onChange={(event) => togglePageSelection(event.target.checked)} type="checkbox" /></th>
                <th>ORDER / DATE</th><th>SHIP TO</th><th>PAYMENT</th><th>FULFILMENT</th><th>TOTAL</th>
              </tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr className={selectedOrderId === order._id ? "selected" : ""} key={order._id}>
                    <td><input aria-label={`Select ${order.orderNumber}`} checked={selectedIds.includes(order._id)} onChange={() => toggleOrder(order._id)} type="checkbox" /></td>
                    <td><button className="fulfilment-order-link" onClick={() => setSelectedOrderId(order._id)} type="button">{order.orderNumber}</button><small>{dateTime(order.createdAt)}</small></td>
                    <td><strong>{order.customer.fullName}</strong><small>{order.customer.phone}</small></td>
                    <td>{order.paymentMethod || "Not recorded"}<small>{order.paymentStatus || order.status}</small></td>
                    <td><span className={`fulfilment-status status-${(order.fulfillmentStatus || "New").toLowerCase().replaceAll(" ", "-")}`}>{order.fulfillmentStatus || "New"}</span></td>
                    <td>{money(order.amount)}{order.codDue > 0 && <small>COD {money(order.codDue)}</small>}</td>
                  </tr>
                ))}
                {!loading && orders.length === 0 && <tr><td className="fulfilment-empty" colSpan="6">No orders match these filters.</td></tr>}
                {loading && <tr><td className="fulfilment-empty" colSpan="6">Loading orders…</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="fulfilment-pagination">
            <button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} type="button">← Previous</button>
            <span>{pagination.total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, pagination.total)} of ${pagination.total}` : "0 orders"}</span>
            <button disabled={page >= pagination.pages || loading} onClick={() => setPage((current) => current + 1)} type="button">Next →</button>
          </div>
        </section>

        {selectedOrder && <section className="fulfilment-detail">
          <div className="fulfilment-detail-heading">
            <div><p className="section-kicker">ORDER DETAIL</p><h2>{selectedOrder.orderNumber}</h2></div>
            <button className="fulfilment-close" onClick={() => { setSelectedOrderId(""); setSelectedOrder(null); }} type="button">Close ×</button>
          </div>
          <div className="fulfilment-detail-grid">
            <div className="fulfilment-detail-main">
              <article className="fulfilment-card">
                <h3>Items & payment</h3>
                {selectedOrder.items.map((item, index) => <div className="fulfilment-item" key={`${item.name}-${index}`}><span>{item.name} × {item.quantity}</span><strong>{money(item.lineTotal ?? item.unitPrice * item.quantity)}</strong></div>)}
                <div className="fulfilment-item fulfilment-total"><span>Order amount</span><strong>{money(selectedOrder.amount)}</strong></div>
                <p>Method: {selectedOrder.paymentMethod || "Not recorded"} · Payment: {selectedOrder.paymentStatus || selectedOrder.status}</p>
                {selectedOrder.amountPaid > 0 && <p>Paid online: {money(selectedOrder.amountPaid)}</p>}
                {selectedOrder.codDue > 0 && <p>Collect on delivery: <strong>{money(selectedOrder.codDue)}</strong></p>}
                {selectedOrder.refundStatus === "refund_pending" && <p className="fulfilment-refund-warning">Refund due: this order has online payment that must be refunded separately.</p>}
              </article>
              <article className="fulfilment-card">
                <h3>Customer & delivery address</h3>
                <strong>{selectedOrder.customer.fullName}</strong>
                <p>{selectedOrder.customer.phone}{selectedOrder.customer.email ? ` · ${selectedOrder.customer.email}` : ""}</p>
                <p>{selectedOrder.customer.address}</p>
                <p>{[selectedOrder.customer.city, selectedOrder.customer.state, selectedOrder.customer.pincode].filter(Boolean).join(", ") || "Location not recorded"}</p>
              </article>
              <article className="fulfilment-card">
                <h3>Attribution</h3>
                <p>Source: <strong>{selectedOrder.utm?.source || "Direct / not recorded"}</strong></p>
                <p>Medium: {selectedOrder.utm?.medium || "—"} · Campaign: {selectedOrder.utm?.campaign || "—"}</p>
                {selectedOrder.landingPage?.slug && <p>Landing page: /lp/{selectedOrder.landingPage.slug}</p>}
              </article>
              <article className="fulfilment-card">
                <div className="fulfilment-card-heading"><h3>Status timeline</h3><span>{selectedOrder.fulfillmentStatus || "New"}</span></div>
                <ol className="fulfilment-timeline">
                  {(selectedOrder.statusTimeline || []).slice().reverse().map((entry, index) => (
                    <li key={`${entry.status}-${entry.changedAt}-${index}`}><strong>{entry.status}</strong><span>{dateTime(entry.changedAt)} · {entry.actor}</span>{entry.note && <small>{entry.note}</small>}</li>
                  ))}
                  {!selectedOrder.statusTimeline?.length && <li><strong>New</strong><span>History not recorded for this legacy order.</span></li>}
                </ol>
              </article>
              <article className="fulfilment-card">
                <h3>Internal notes</h3>
                <form className="fulfilment-note-form" onSubmit={addNote}>
                  <textarea maxLength="2000" onChange={(event) => setNote(event.target.value)} placeholder="Add a note for the operations team" required rows="3" value={note} />
                  <button disabled={busy} type="submit">Add note</button>
                </form>
                <ul className="fulfilment-notes">
                  {(selectedOrder.internalNotes || []).slice().reverse().map((entry, index) => <li key={`${entry.createdAt}-${index}`}><p>{entry.body}</p><small>{entry.author} · {dateTime(entry.createdAt)}</small></li>)}
                  {!selectedOrder.internalNotes?.length && <li className="muted">No internal notes yet.</li>}
                </ul>
              </article>
            </div>
            <aside className="fulfilment-actions">
              <article className="fulfilment-card">
                <h3>Operations actions</h3>
                {nextStatuses.length > 0 && <div className="fulfilment-status-actions">
                  <label>Change fulfilment status<select onChange={(event) => setNextStatus(event.target.value)} value={nextStatus}><option value="" disabled>Select next status</option>{nextStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                  <label>Timeline note<input maxLength="500" onChange={(event) => setStatusNote(event.target.value)} value={statusNote} /></label>
                  <button disabled={busy || !nextStatus} onClick={() => changeStatus(nextStatus)} type="button">Save status change</button>
                </div>}
                <div className="fulfilment-pdf-actions">
                  <button disabled={busy || !["Paid", "CODConfirmed", "New"].includes(selectedOrder.status)} onClick={() => printOne("invoice")} type="button">Download GST invoice PDF</button>
                  <button disabled={busy || !selectedOrder.shipment?.awb} onClick={() => printOne("label")} type="button">Download 4 × 6 shipping label</button>
                </div>
                {selectedOrder.fulfillmentStatus === "Packed" && !selectedOrder.shipment?.awb && <div className="fulfilment-booking">
                  <label>Package weight (kg)<input max="50" min="0.01" onChange={(event) => setWeightKg(event.target.value)} required step="0.01" type="number" value={weightKg} /></label>
                  <button disabled={busy} onClick={bookCourier} type="button">Book mock courier ↗</button>
                  <small>Assignment-safe mocked courier; no external booking is made.</small>
                </div>}
                {selectedOrder.shipment?.awb && <div className="fulfilment-shipment">
                  <strong>{selectedOrder.shipment.courierName}</strong>
                  <span>AWB {selectedOrder.shipment.awb}</span>
                  <span>{Number(selectedOrder.shipment.weightKg).toFixed(2)} kg · booked {dateTime(selectedOrder.shipment.bookedAt)}</span>
                  {selectedOrder.shipment.manifestId && <small>Manifest {selectedOrder.shipment.manifestId}</small>}
                </div>}
                {selectedOrder.shipment?.ndrStatus === "action_required" && <div className="fulfilment-ndr">
                  <strong>NDR · attempt {selectedOrder.shipment.ndrAttempts}</strong>
                  <p>Choose a delivery reattempt or return the parcel to origin.</p>
                  <button disabled={busy} onClick={() => resolveNdr("reattempt")} type="button">Request reattempt</button>
                  <button disabled={busy} onClick={() => resolveNdr("cancel")} type="button">Cancel / return to origin</button>
                </div>}
              </article>
            </aside>
          </div>
        </section>}
      </div>
    </main>
  );
}
