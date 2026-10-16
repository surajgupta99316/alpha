import { useEffect, useState } from "react";
import { api } from "./api.js";
import "./postpurchase.css";

const money = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const dateTime = (value) => value
  ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
  : "—";
const REASONS = [
  ["damaged", "Item arrived damaged"],
  ["wrong_item", "Wrong item received"],
  ["not_as_described", "Item differs from description"],
  ["quality_issue", "Quality issue"],
  ["other", "Other"],
];

function useOrderLookup() {
  const [credentials, setCredentials] = useState({ orderNumber: "", phone: "" });
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function lookup(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOrder(null);
    try {
      setOrder(await api.trackOrder(credentials));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }
  return { credentials, setCredentials, order, setOrder, busy, setBusy, error, setError, lookup };
}

function StatusTimeline({ entries }) {
  return (
    <ol className="post-timeline">
      {entries.map((entry, index) => (
        <li key={`${entry.status}-${entry.changedAt}-${index}`}>
          <span className="post-timeline-mark" />
          <div><strong>{entry.status}</strong><time>{dateTime(entry.changedAt)}</time>{entry.note && <p>{entry.note}</p>}</div>
        </li>
      ))}
    </ol>
  );
}

function ReturnForm({ order, credentials }) {
  const [selected, setSelected] = useState({});
  const [reason, setReason] = useState(REASONS[0][0]);
  const [message, setMessage] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function choosePhoto(event) {
    setError("");
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoDataUrl("");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 1_000_000) {
      event.target.value = "";
      setError("Choose a JPEG, PNG, or WebP photo no larger than 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => setError("The selected photo could not be read.");
    reader.readAsDataURL(file);
  }
  async function submit(event) {
    event.preventDefault();
    const items = Object.entries(selected)
      .filter(([, selection]) => selection.checked)
      .map(([index, selection]) => ({ index: Number(index), quantity: Number(selection.quantity) }));
    if (!items.length) {
      setError("Select at least one item to return.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.requestReturn({
        ...credentials,
        items,
        reason,
        message,
        ...(photoDataUrl ? { photoDataUrl } : {}),
      });
      setNotice(`Request ${result.returnNumber} submitted. Status: ${result.status}.`);
      setSelected({});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }
  if (!order.return.eligible) {
    return <p className="post-muted">Returns can be requested within {order.return.windowDays} days of delivery{order.return.deadline ? ` (until ${new Date(order.return.deadline).toLocaleDateString("en-IN")})` : ""}.</p>;
  }
  return (
    <form className="post-form return-form" onSubmit={submit}>
      <h3>Request a return</h3>
      <p className="post-muted">Choose the items and quantities you want to return. A request must be reviewed by our support team.</p>
      <div className="post-return-items">
        {order.items.map((item, index) => (
          <label className="post-return-item" key={`${item.name}-${index}`}>
            <input
              checked={Boolean(selected[index]?.checked)}
              onChange={(event) => setSelected((current) => ({
                ...current,
                [index]: { checked: event.target.checked, quantity: current[index]?.quantity || 1 },
              }))}
              type="checkbox"
            />
            <span>{item.name} <small>Ordered: {item.quantity}</small></span>
            {selected[index]?.checked && <input
              aria-label={`Return quantity for ${item.name}`}
              min="1"
              max={item.quantity}
              onChange={(event) => setSelected((current) => ({
                ...current,
                [index]: { ...current[index], quantity: event.target.value },
              }))}
              type="number"
              value={selected[index].quantity}
            />}
          </label>
        ))}
      </div>
      <label>Reason<select onChange={(event) => setReason(event.target.value)} value={reason}>{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Additional details<textarea maxLength="1000" onChange={(event) => setMessage(event.target.value)} rows="3" value={message} /></label>
      <label>Photo (optional)<input accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} type="file" /><small>JPEG, PNG, or WebP; maximum 1 MB.</small></label>
      {error && <p className="post-error" role="alert">{error}</p>}
      {notice && <p className="post-notice" role="status">{notice}</p>}
      <button className="post-button" disabled={busy} type="submit">{busy ? "Submitting…" : "Submit return request"} ↗</button>
    </form>
  );
}

export function TrackingPage() {
  const lookup = useOrderLookup();
  return (
    <section className="post-page">
      <p className="post-eyebrow">POST-PURCHASE CARE</p>
      <h1>Track your <em>order.</em></h1>
      <p className="post-lede">Enter the order number and the mobile number used at checkout.</p>
      <form className="post-form post-lookup" onSubmit={lookup.lookup}>
        <label>Order number<input autoComplete="off" maxLength="50" onChange={(event) => lookup.setCredentials((current) => ({ ...current, orderNumber: event.target.value }))} required value={lookup.credentials.orderNumber} /></label>
        <label>Mobile number<input autoComplete="tel" inputMode="numeric" maxLength="10" onChange={(event) => lookup.setCredentials((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))} required value={lookup.credentials.phone} /></label>
        {lookup.error && <p className="post-error" role="alert">{lookup.error}</p>}
        <button className="post-button" disabled={lookup.busy} type="submit">{lookup.busy ? "Finding order…" : "Track order"} ↗</button>
      </form>
      {lookup.order && <div className="post-order-card">
        <div className="post-order-heading"><div><p className="post-eyebrow">ORDER {lookup.order.orderNumber}</p><h2>{lookup.order.fulfillmentStatus}</h2></div><span>{lookup.order.shipment?.courierName || "Courier update pending"}</span></div>
        {lookup.order.shipment?.awb && <div className="post-shipment"><span>AWB <strong>{lookup.order.shipment.awb}</strong></span>{lookup.order.shipment.trackingUrl
          ? <a href={lookup.order.shipment.trackingUrl} rel="noreferrer" target="_blank">Open courier tracking ↗</a>
          : <span className="post-muted">Mock shipment — courier tracking link unavailable</span>}</div>}
        <StatusTimeline entries={lookup.order.statusTimeline} />
        <div className="post-order-items"><h3>Items</h3>{lookup.order.items.map((item, index) => <p key={`${item.name}-${index}`}><span>{item.name}</span><strong>× {item.quantity}</strong></p>)}</div>
        {lookup.order.return.eligible && <ReturnForm credentials={lookup.credentials} order={lookup.order} />}
      </div>}
    </section>
  );
}

export function SupportPage() {
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", orderNumber: "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.createSupportTicket(form);
      setNotice(`Ticket ${result.ticketNumber} has been created. Our team will be in touch.`);
      setForm({ fullName: "", phone: "", email: "", orderNumber: "", subject: "", message: "" });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="post-page">
      <p className="post-eyebrow">WE’RE HERE TO HELP</p>
      <h1>Contact <em>support.</em></h1>
      <p className="post-lede">Share the details and our team will follow up. Add your order number to link the request to a purchase.</p>
      <form className="post-form post-support-form" onSubmit={submit}>
        <label>Full name<input maxLength="100" onChange={(event) => setForm({ ...form, fullName: event.target.value })} required value={form.fullName} /></label>
        <label>Mobile number<input inputMode="numeric" maxLength="10" onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 10) })} required value={form.phone} /></label>
        <label>Email (optional)<input maxLength="254" onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" value={form.email} /></label>
        <label>Order number (optional)<input maxLength="50" onChange={(event) => setForm({ ...form, orderNumber: event.target.value })} value={form.orderNumber} /></label>
        <label className="post-wide">Subject<input maxLength="150" onChange={(event) => setForm({ ...form, subject: event.target.value })} required value={form.subject} /></label>
        <label className="post-wide">How can we help?<textarea maxLength="3000" onChange={(event) => setForm({ ...form, message: event.target.value })} required rows="5" value={form.message} /></label>
        {error && <p className="post-error post-wide" role="alert">{error}</p>}
        {notice && <p className="post-notice post-wide" role="status">{notice}</p>}
        <button className="post-button post-wide" disabled={busy} type="submit">{busy ? "Sending…" : "Create support ticket"} ↗</button>
      </form>
    </section>
  );
}

function AdminHeader({ navigate }) {
  return <header className="post-admin-header"><a href="/admin/fulfilment" onClick={(event) => { event.preventDefault(); navigate("/admin/fulfilment"); }}>ALPHA MALE · POST-PURCHASE</a><nav><button onClick={() => navigate("/admin/returns")} type="button">Returns</button><button onClick={() => navigate("/admin/support")} type="button">Support & notifications</button><button onClick={() => navigate("/admin/fulfilment")} type="button">Fulfilment</button></nav></header>;
}

function AdminReturns() {
  const [returns, setReturns] = useState([]);
  const [refs, setRefs] = useState({});
  const [actor, setActor] = useState("Operations team");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      setReturns(await api.getReturnRequests());
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  useEffect(() => { load(); }, []);
  async function changeStatus(item, status) {
    setBusyId(item._id);
    setError("");
    setNotice("");
    try {
      await api.updateReturnRequest(item._id, {
        status,
        actor,
        ...(refs[item._id] ? { manualRefundReference: refs[item._id] } : {}),
      });
      setNotice(`${item.returnNumber} moved to ${status}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }
  return (
    <section className="post-admin-section">
      <div className="post-admin-title"><div><p className="post-eyebrow">CUSTOMER CARE</p><h1>Return requests</h1></div><label>Operator<input maxLength="100" onChange={(event) => setActor(event.target.value)} value={actor} /></label></div>
      {error && <p className="post-error" role="alert">{error}</p>}{notice && <p className="post-notice" role="status">{notice}</p>}
      {!returns.length && !error && <p className="post-muted">No return requests yet.</p>}
      <div className="post-admin-list">{returns.map((item) => {
        const transitions = item.status === "Requested" ? ["Approved", "Rejected"] : item.status === "Approved" ? ["Picked up"] : item.status === "Picked up" ? ["Refunded"] : [];
        return <article className="post-admin-card" key={item._id}>
          <div className="post-admin-card-heading"><div><p className="post-eyebrow">{item.returnNumber}</p><h2>{item.orderNumber}</h2><span>{item.status} · {dateTime(item.createdAt)}</span></div><strong>{money(item.refundAmount)} estimated refund</strong></div>
          <p><strong>Reason:</strong> {item.reason.replaceAll("_", " ")}{item.message && ` — ${item.message}`}</p>
          <ul>{item.items.map((line, index) => <li key={`${line.name}-${index}`}>{line.name} × {line.quantity}</li>)}</ul>
          <p><strong>Contact:</strong> {item.phone} · Payment: {item.order?.paymentMethod || "legacy/manual"}</p>
          {item.hasPhoto && <a href={`/api/admin/post-purchase/returns/${encodeURIComponent(item._id)}/photo`} rel="noreferrer" target="_blank">View customer photo ↗</a>}
          {item.razorpayRefundId && <p>Razorpay refund {item.razorpayRefundId} · {item.refundProviderStatus || "submitted"}</p>}
          {transitions.includes("Refunded") && !item.order?.razorpayPaymentId && item.refundAmount > 0 && <label>Manual refund reference<input maxLength="100" onChange={(event) => setRefs({ ...refs, [item._id]: event.target.value })} value={refs[item._id] || ""} /></label>}
          {transitions.length > 0 && <div className="post-admin-actions">{transitions.map((status) => <button disabled={busyId === item._id || (status === "Refunded" && !item.order?.razorpayPaymentId && item.refundAmount > 0 && !refs[item._id])} key={status} onClick={() => changeStatus(item, status)} type="button">{busyId === item._id ? "Saving…" : status}</button>)}</div>}
          <StatusTimeline entries={item.statusTimeline} />
        </article>;
      })}</div>
    </section>
  );
}

function AdminSupport() {
  const [tickets, setTickets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [replies, setReplies] = useState({});
  const [actor, setActor] = useState("Support team");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      const [ticketRows, notificationRows] = await Promise.all([api.getSupportTickets(), api.getNotificationLogs()]);
      setTickets(ticketRows);
      setLogs(notificationRows);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  useEffect(() => { load(); }, []);
  async function updateTicket(ticket) {
    setBusyId(ticket._id);
    setError("");
    try {
      await api.updateSupportTicket(ticket._id, {
        status: ticket.status,
        author: actor,
        reply: replies[ticket._id] || "",
      });
      setReplies((current) => ({ ...current, [ticket._id]: "" }));
      setNotice(`${ticket.ticketNumber} updated.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }
  async function retry(log) {
    setBusyId(log._id);
    setError("");
    try {
      await api.retryNotification(log._id);
      setNotice(`${log.orderNumber} notification retry completed.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }
  return (
    <section className="post-admin-section">
      <div className="post-admin-title"><div><p className="post-eyebrow">CUSTOMER CARE</p><h1>Support desk</h1></div><label>Operator<input maxLength="100" onChange={(event) => setActor(event.target.value)} value={actor} /></label></div>
      {error && <p className="post-error" role="alert">{error}</p>}{notice && <p className="post-notice" role="status">{notice}</p>}
      <h2 className="post-subheading">Tickets</h2>
      {!tickets.length && <p className="post-muted">No support tickets yet.</p>}
      <div className="post-admin-list">{tickets.map((ticket) => <article className="post-admin-card" key={ticket._id}>
        <div className="post-admin-card-heading"><div><p className="post-eyebrow">{ticket.ticketNumber} · {ticket.status}</p><h2>{ticket.subject}</h2><span>{ticket.fullName} · {ticket.phone}{ticket.email && ` · ${ticket.email}`}{ticket.orderNumber && ` · ${ticket.orderNumber}`}</span></div></div>
        <p className="post-ticket-message">{ticket.message}</p>
        {ticket.replies.map((reply, index) => <blockquote className="post-ticket-reply" key={`${reply.createdAt}-${index}`}><strong>{reply.author} · internal</strong><p>{reply.body}</p><time>{dateTime(reply.createdAt)}</time></blockquote>)}
        <label>Internal reply<textarea maxLength="3000" onChange={(event) => setReplies({ ...replies, [ticket._id]: event.target.value })} rows="2" value={replies[ticket._id] || ""} /></label>
        <div className="post-admin-actions"><label>Status<select onChange={(event) => setTickets((current) => current.map((row) => row._id === ticket._id ? { ...row, status: event.target.value } : row))} value={ticket.status}><option>Open</option><option>In progress</option><option>Closed</option></select></label><button disabled={busyId === ticket._id} onClick={() => updateTicket(ticket)} type="button">{busyId === ticket._id ? "Saving…" : "Save ticket"}</button></div>
      </article>)}</div>
      <h2 className="post-subheading">Order notifications</h2>
      {!logs.length && <p className="post-muted">No notification events yet.</p>}
      <div className="post-admin-list">{logs.map((log) => <article className="post-notification-row" key={log._id}>
        <div><strong>{log.orderNumber} · {log.event.replaceAll("_", " ")}</strong><span>{log.status} · {dateTime(log.createdAt)}</span><small>Email: {log.email.status} ({log.email.provider}) · Message: {log.message.status} ({log.message.provider})</small>
          {[log.email, log.message].some((delivery) => delivery.error) && <small className="post-error-copy">{[log.email, log.message].filter((delivery) => delivery.error).map((delivery) => delivery.error).join(" · ")}</small>}
        </div>
        {["failed", "partial"].includes(log.status) && <button disabled={busyId === log._id} onClick={() => retry(log)} type="button">{busyId === log._id ? "Retrying…" : "Retry failed channel"}</button>}
      </article>)}</div>
    </section>
  );
}

export function PostPurchaseAdmin({ mode, navigate }) {
  return <main className="post-admin"><AdminHeader navigate={navigate} />{mode === "returns" ? <AdminReturns /> : <AdminSupport />}</main>;
}
