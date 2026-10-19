import { useEffect, useState } from "react";
import { api } from "./api.js";

const emptyForm = {
    productId: "",
    slug: "",
    headline: "",
    variantHeadline: "",
    subheadline: "",
    heroImage: "",
    offerText: "",
    benefits: [],
    ingredients: [],
    faqs: [],
    testimonials: [],
    published: false,
};


export default function Admin({ navigate }) {
    const [tab, setTab] = useState("pages");
    const [products, setProducts] = useState([]);
    const [pages, setPages] = useState([]);
    const [orders, setOrders] = useState([]);
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(true);

    async function loadAdminData() {
        setLoading(true);
        setError("");
        try {
            const [productData, pageData, orderData] = await Promise.all([
                api.getProducts(),
                api.getAdminPages(),
                api.getOrders(),
            ]);
            setProducts(productData);
            setPages(pageData);
            setOrders(orderData);
            if (!form.productId && productData[0]) {
                setForm((current) => ({ ...current, productId: productData[0]._id }));
            }
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAdminData();
    }, []);

    function startNewPage() {
        setTab("pages");
        setSelected(null);
        setNotice("");
        setError("");
        setForm({
            ...emptyForm,
            productId: products[0]?._id || "",
            faqs: [{ question: "", answer: "" }],
        });
    }

    function editPage(page) {
        setSelected(page._id);
        setNotice("");
        setError("");
        setForm({
            productId: page.product?._id || page.product,
            slug: page.slug,
            headline: page.headline,
            variantHeadline: page.variantHeadline || "",
            subheadline: page.subheadline,
            heroImage: page.heroImage,
            offerText: page.offerText,
            benefits: page.benefits || [],
            ingredients: page.ingredients || [],
            faqs: page.faqs?.length ? page.faqs.map(({ question, answer }) => ({ question, answer })) : [],
            testimonials: page.testimonials || [],
            published: page.published,
        });
    }

    function updateField(event) {
        const { name, value, type, checked } = event.target;
        setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    }

    function updateList(name, value) {
        setForm((current) => ({
            ...current,
            [name]: value.split("\n").map((line) => line.trim()).filter(Boolean),
        }));
    }

    function updateFaq(index, key, value) {
        setForm((current) => ({
            ...current,
            faqs: current.faqs.map((faq, faqIndex) => faqIndex === index ? { ...faq, [key]: value } : faq),
        }));
    }

    async function savePage(event) {
        event.preventDefault();
        setError("");
        setNotice("");
        try {
            const saved = await api.saveLandingPage(form, selected);
            await loadAdminData();
            editPage(saved);
            setNotice(saved.published ? "Campaign saved and published." : "Campaign saved as a draft.");
        } catch (requestError) {
            setError(requestError.message);
        }
    }

    return (
        <main className="admin-shell">
            <header className="admin-header">
                <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>ALPHA<span>MALE</span></a>
                <div className="admin-title"><span>CAMPAIGN STUDIO</span><strong>Module 01 · Acquire</strong></div>
                <div className="admin-header-links">
                    <a className="admin-preview-link" href="/admin/crm" onClick={(event) => { event.preventDefault(); navigate("/admin/crm"); }}>Customers</a>
                    <a className="admin-preview-link" href="/admin/leads" onClick={(event) => { event.preventDefault(); navigate("/admin/leads"); }}>Leads</a>
                    <a className="admin-preview-link" href="/admin/analytics" onClick={(event) => { event.preventDefault(); navigate("/admin/analytics"); }}>Analytics</a>
                    <a className="admin-preview-link" href="/admin/products" onClick={(event) => { event.preventDefault(); navigate("/admin/products"); }}>Products</a>
                    <a className="admin-preview-link" href="/admin/reviews" onClick={(event) => { event.preventDefault(); navigate("/admin/reviews"); }}>Reviews</a>
                    <a className="admin-preview-link" href="/admin/staff" onClick={(event) => { event.preventDefault(); navigate("/admin/staff"); }}>Staff</a>
                    <a className="admin-preview-link" href="/admin/fulfilment" onClick={(event) => { event.preventDefault(); navigate("/admin/fulfilment"); }}>Fulfilment</a>
                    <a className="admin-preview-link" href="/admin/returns" onClick={(event) => { event.preventDefault(); navigate("/admin/returns"); }}>Returns</a>
                    <a className="admin-preview-link" href="/admin/support" onClick={(event) => { event.preventDefault(); navigate("/admin/support"); }}>Support</a>
                    <a className="admin-preview-link" href="/admin/coupons" onClick={(event) => { event.preventDefault(); navigate("/admin/coupons"); }}>Coupons</a>
                    <a className="admin-preview-link" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>View storefront ↗</a>
                </div>
            </header>
            <div className="admin-content">
                <div className="admin-heading">
                    <div><p className="section-kicker">THE ACQUISITION DESK</p><h1>Campaigns that<br /><em>make a first impression.</em></h1></div>
                    <button className="button button-dark" onClick={startNewPage} type="button">+ New campaign</button>
                </div>
                <div className="admin-tabs" role="tablist" aria-label="Admin sections">
                    <button className={tab === "pages" ? "active" : ""} onClick={() => setTab("pages")} role="tab" type="button">Landing pages <span>{pages.length}</span></button>
                    <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")} role="tab" type="button">Order requests <span>{orders.length}</span></button>
                </div>

                {error && <p className="admin-error" role="alert">{error}</p>}
                {loading ? <p className="admin-loading">Loading your campaign studio…</p> : tab === "orders" ? (
                    <OrdersTable orders={orders} />
                ) : (
                    <div className="admin-workspace">
                        <div className="campaign-list">
                            <div className="list-heading"><span>YOUR CAMPAIGNS</span><span>{pages.length} TOTAL</span></div>
                            {pages.map((page) => (
                                <button className={`campaign-list-item ${selected === page._id ? "selected" : ""}`} key={page._id} onClick={() => editPage(page)} type="button">
                                    <span className="campaign-thumb"><img src={page.heroImage} alt="" loading="lazy" /></span>
                                    <span className="campaign-list-copy"><strong>{page.headline}</strong><small>/lp/{page.slug}</small></span>
                                    <span className={`status-pill ${page.published ? "published" : "draft"}`}>{page.published ? "LIVE" : "DRAFT"}</span>
                                </button>
                            ))}
                            {pages.length === 0 && <p className="empty-state">Create your first campaign landing page.</p>}
                        </div>

                        <form className="editor-form" onSubmit={savePage}>
                            <div className="editor-heading">
                                <div><span className="section-kicker">{selected ? "EDIT CAMPAIGN" : "NEW CAMPAIGN"}</span><h2>{selected ? "Shape the story." : "Start with a story."}</h2></div>
                                <label className="publish-toggle"><input checked={form.published} name="published" onChange={updateField} type="checkbox" /><span>{form.published ? "Published" : "Draft"}</span></label>
                            </div>
                            <label>Featured product<select name="productId" onChange={updateField} required value={form.productId}><option value="" disabled>Select a product</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} · ₹{product.price}</option>)}</select></label>
                            <div className="admin-form-row">
                                <label>Custom URL<input name="slug" onChange={updateField} pattern="[a-z0-9]+(-[a-z0-9]+)*" required value={form.slug} placeholder="alpha-bold" /><small>Published at /lp/{form.slug || "your-campaign"}</small></label>
                                <label>Offer text<input maxLength="180" name="offerText" onChange={updateField} required value={form.offerText} placeholder="Launch offer: save 20% today" /></label>
                            </div>
                            <label>Headline<input maxLength="120" name="headline" onChange={updateField} required value={form.headline} placeholder="Make your presence unforgettable." /></label>
                            <label>Headline test · Variant B<input maxLength="120" name="variantHeadline" onChange={updateField} value={form.variantHeadline} placeholder="Try a distinct alternative headline (optional)" /><small>Visitors are randomly split 50/50 and retain the same headline on this browser. Use ?ab_variant=A or ?ab_variant=B to preview a variant.</small></label>
                            {form.slug && <div className="campaign-preview-tools"><a href={`${(import.meta.env.VITE_PUBLIC_API_URL || "http://localhost:5000").replace(/\/+$/, "")}/api/campaign-preview/${encodeURIComponent(form.slug)}`} rel="noreferrer" target="_blank">Open social preview ↗</a>{form.variantHeadline && <a href={`${(import.meta.env.VITE_PUBLIC_API_URL || "http://localhost:5000").replace(/\/+$/, "")}/api/campaign-preview/${encodeURIComponent(form.slug)}?ab_variant=B`} rel="noreferrer" target="_blank">Social preview B</a>}<a href={`/lp/${encodeURIComponent(form.slug)}?ab_variant=A`} rel="noreferrer" target="_blank">Preview A</a>{form.variantHeadline && <a href={`/lp/${encodeURIComponent(form.slug)}?ab_variant=B`} rel="noreferrer" target="_blank">Preview B</a>}</div>}
                            <label>Supporting copy<textarea maxLength="240" name="subheadline" onChange={updateField} required rows="2" value={form.subheadline} placeholder="A line that brings your campaign to life." /></label>
                            <label>Banner image URL<input name="heroImage" onChange={updateField} required type="url" value={form.heroImage} placeholder="https://…" /></label>
                            <div className="admin-form-row">
                                <label>Benefits <span className="field-hint">ONE PER LINE</span><textarea onChange={(event) => updateList("benefits", event.target.value)} rows="4" value={form.benefits.join("\n")} placeholder={"Fresh opening\nWarm woody finish"} /></label>
                                <label>Ingredients / notes <span className="field-hint">ONE PER LINE</span><textarea onChange={(event) => updateList("ingredients", event.target.value)} rows="4" value={form.ingredients.join("\n")} placeholder={"Bergamot\nCedarwood"} /></label>
                            </div>
                            <div className="faq-editor-heading"><span>FAQs</span><button className="text-button" onClick={() => setForm((current) => ({ ...current, faqs: [...current.faqs, { question: "", answer: "" }] }))} type="button">+ Add FAQ</button></div>
                            {form.faqs.map((faq, index) => (
                                <div className="faq-editor-row" key={index}>
                                    <label>Question<input onChange={(event) => updateFaq(index, "question", event.target.value)} required value={faq.question} /></label>
                                    <label>Answer<input onChange={(event) => updateFaq(index, "answer", event.target.value)} required value={faq.answer} /></label>
                                    <button aria-label={`Remove FAQ ${index + 1}`} className="remove-faq" onClick={() => setForm((current) => ({ ...current, faqs: current.faqs.filter((_, faqIndex) => faqIndex !== index) }))} type="button">×</button>
                                </div>
                            ))}
                            {notice && <p className="admin-notice" role="status">{notice}</p>}
                            <div className="editor-actions"><button className="button button-dark" type="submit">Save campaign <span aria-hidden="true">↗</span></button>{selected && form.published && <a href={`/lp/${form.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/lp/${form.slug}`); }}>View live page ↗</a>}</div>
                        </form>
                    </div>
                )}
            </div>
        </main>
    );
}


function OrdersTable({ orders }) {
    if (orders.length === 0) return <div className="empty-orders"><span>✳</span><h2>No orders yet.</h2><p>New one-step order requests will appear here, with their first-touch campaign source.</p></div>;
    return (
        <div className="orders-table-wrap">
            <table className="orders-table">
                <thead><tr><th>ORDER</th><th>CUSTOMER</th><th>PRODUCT</th><th>CAMPAIGN SOURCE</th><th>AMOUNT</th><th>DATE</th></tr></thead>
                <tbody>{orders.map((order) => (
                    <tr key={order._id}>
                        <td><strong>{order.orderNumber}</strong><span className="order-status">{order.status}</span></td>
                        <td>{order.customer.fullName}<small>{order.customer.phone}</small></td>
                        <td>{order.product.name}</td>
                        <td>{order.utm?.source || "Direct"}<small>{order.utm?.medium || "—"}{order.utm?.campaign ? ` · ${order.utm.campaign}` : ""}</small></td>
                        <td>₹{order.amount}</td>
                        <td>{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    );
}
