import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { captureFirstTouch } from "./attribution.js";
import Storefront from "./Storefront.jsx";
import CouponAdmin from "./CouponAdmin.jsx";
import FulfilmentAdmin from "./FulfilmentAdmin.jsx";
import { PostPurchaseAdmin } from "./PostPurchase.jsx";
import CRMAdmin, { StaffGate } from "./CRMAdmin.jsx";
import { getExperimentVisitorId, getHeadlineVariant, trackCommerceEvent, trackPageView } from "./analytics.js";
import { updateSeoMetadata } from "./seo.js";

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

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return [path, (nextPath) => {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    window.scrollTo(0, 0);
  }];
}

export default function App() {
  const [path, navigate] = usePath();
  useEffect(() => {
    trackPageView(path);
  }, [path]);
  const [cart, setCart] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("alpha:cart") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      console.warn("Saved cart data was invalid and has been cleared.", error);
      try {
        window.localStorage.removeItem("alpha:cart");
      } catch (storageError) {
        console.warn("Could not clear invalid cart data from this browser.", storageError);
      }
      return [];
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("alpha:cart", JSON.stringify(cart));
    } catch (error) {
      console.error("Could not save the shopping cart in this browser.", error);
    }
  }, [cart]);
  if (path === "/admin" || path.startsWith("/admin/")) {
    let screen;
    if (path === "/admin/fulfilment" || path === "/admin/orders") screen = <FulfilmentAdmin navigate={navigate} />;
    else if (path === "/admin/returns") screen = <PostPurchaseAdmin mode="returns" navigate={navigate} />;
    else if (path === "/admin/support") screen = <PostPurchaseAdmin mode="support" navigate={navigate} />;
    else if (path === "/admin/coupons") screen = <CouponAdmin navigate={navigate} />;
    else if (path === "/admin/crm") screen = <CRMAdmin mode="customers" navigate={navigate} />;
    else if (path === "/admin/leads") screen = <CRMAdmin mode="leads" navigate={navigate} />;
    else if (path === "/admin/abandoned-carts") screen = <CRMAdmin mode="carts" navigate={navigate} />;
    else if (path === "/admin/analytics") screen = <CRMAdmin mode="analytics" navigate={navigate} />;
    else if (path === "/admin/products") screen = <CRMAdmin mode="products" navigate={navigate} />;
    else if (path === "/admin/reviews") screen = <CRMAdmin mode="reviews" navigate={navigate} />;
    else if (path === "/admin/staff") screen = <CRMAdmin mode="staff" navigate={navigate} />;
    else screen = <Admin navigate={navigate} />;
    return <StaffGate path={path} navigate={navigate}>{screen}</StaffGate>;
  }
  if (path.startsWith("/lp/")) {
    const slug = decodeURIComponent(path.slice(4));
    return <CampaignPage key={slug} slug={slug} />;
  }
  return <Storefront path={path} cart={cart} setCart={setCart} navigate={navigate} />;
}

function CampaignPage({ slug }) {
  const trackedCampaignView = useRef("");
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [attribution] = useState(() => captureFirstTouch(window.location.search, window.localStorage));
  const [headlineTest, setHeadlineTest] = useState({ variant: "A", headline: "" });
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api
      .getLandingPage(slug)
      .then((data) => {
        if (trackedCampaignView.current === slug) return;
        trackedCampaignView.current = slug;
        const assignment = getHeadlineVariant(data.slug, data.variantHeadline, window.location.search, window.localStorage);
        setHeadlineTest(assignment);
        setPage(data);
        if (data.variantHeadline && !assignment.overridden) {
          const visitorId = getExperimentVisitorId(window.localStorage);
          if (visitorId) {
            api.recordHeadlineExposure({ slug: data.slug, variant: assignment.variant, visitorId })
              .catch((requestError) => console.error("Could not record the campaign headline-test exposure.", requestError));
          }
        }
        updateSeoMetadata({
          title: `${data.product.name} | Alpha Male`,
          description: data.subheadline,
          image: data.heroImage,
          url: window.location.href,
        });
        trackCommerceEvent("view_item", {
          id: data.product._id,
          name: data.product.name,
          price: data.product.price,
          campaign: data.slug,
          variant: assignment.variant,
          content_type: "product",
        });
      })
      .catch((requestError) => setError(requestError.message));
  }, [slug]);

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitOrder(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      trackCommerceEvent("begin_checkout", {
        id: page.product._id,
        name: page.product.name,
        price: page.product.price,
        campaign: slug,
        variant: headlineTest.variant,
      });
      const result = await api.createOrder({
        ...form,
        slug,
        utm: attribution,
        headlineVariant: headlineTest.variant,
        experimentVisitorId: headlineTest.overridden ? "" : getExperimentVisitorId(window.localStorage),
      });
      setSuccess(result.orderNumber);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !page) return <ErrorScreen message={error} />;
  if (!page) return <div className="page-loading">Preparing your next signature…</div>;

  const product = page.product;
  return (
    <main className="campaign-page">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Alpha Male home">ALPHA<span>MALE</span></a>
        <span className="header-note">OWN YOUR EVERYDAY</span>
        <a className="header-link" href="#order">Get {product.name} <span aria-hidden="true">↗</span></a>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> THE SIGNATURE COLLECTION</p>
          <h1>{headlineTest.headline || page.headline}</h1>
          <p className="hero-description">{page.subheadline}</p>
          <div className="hero-offer">{page.offerText}</div>
          <div className="hero-actions">
            <a className="button button-dark" href="#order">Make it yours <span aria-hidden="true">↗</span></a>
            <span className="price-note"><strong>₹{product.price}</strong><s>₹{product.mrp}</s></span>
          </div>
          <div className="hero-proof">
            <span className="proof-mark" aria-hidden="true">✳</span>
            <span>Made for the moments that matter</span>
          </div>
        </div>
        <div className="hero-visual">
          <img className="hero-image" src={page.heroImage} alt={`${product.name} fragrance`} fetchpriority="high" />
          <span className="image-index">01 / SIGNATURE SCENT</span>
          <div className="image-stamp"><span>ALPHA<br />MALE</span><small>EAU DE PARFUM</small></div>
        </div>
        <div className="hero-index">01—04 <span>THE ALPHA EDIT</span></div>
      </section>

      <section className="offer-ribbon" aria-label="Current offer">
        <span>MADE TO LEAVE A MARK</span><span className="ribbon-star">✳</span>
        <span>{page.offerText}</span><span className="ribbon-star">✳</span>
        <span>YOUR NEXT MOVE STARTS HERE</span>
      </section>

      <section className="story-section section-shell">
        <div className="section-kicker">01 / THE FEELING</div>
        <div className="story-grid">
          <h2>A good first impression.<br /><em>A better second one.</em></h2>
          <div className="story-copy">
            <p>{product.description} {product.name} brings a fresh opening and a considered, warm finish to your everyday ritual.</p>
            <a className="text-link" href="#order">Discover your signature <span aria-hidden="true">↘</span></a>
          </div>
        </div>
      </section>

      <section className="benefits-section section-shell">
        <div className="section-kicker">02 / THE DETAILS</div>
        <div className="benefits-grid">
          {page.benefits.map((benefit, index) => (
            <article className="benefit-card" key={`${benefit}-${index}`}>
              <span className="benefit-number">0{index + 1}</span>
              <h3>{benefit}</h3>
              <span className="benefit-arrow" aria-hidden="true">↗</span>
            </article>
          ))}
          {page.benefits.length === 0 && (
            <p className="muted-copy">The details that make this one yours.</p>
          )}
        </div>
      </section>

      <section className="notes-section">
        <div className="notes-image">
          <img
            src="https://images.unsplash.com/photo-1615634260167-c8cdede054de?auto=format&fit=crop&w=1100&q=78"
            alt="A warm, textured fragrance still life"
            loading="lazy"
          />
          <span className="notes-image-caption">A closer look at the craft</span>
        </div>
        <div className="notes-copy">
          <div className="section-kicker">03 / THE NOTES</div>
          <h2>Not just a scent.<br /><em>A signature.</em></h2>
          <p>Built around thoughtful notes that unfold naturally, never trying too hard.</p>
          <div className="ingredient-list">
            {page.ingredients.map((ingredient, index) => (
              <div className="ingredient-row" key={`${ingredient}-${index}`}>
                <span>0{index + 1}</span><strong>{ingredient}</strong><span aria-hidden="true">+</span>
              </div>
            ))}
          </div>
          <a className="button button-light" href="#order">Try Alpha Bold <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section className="reviews-section section-shell">
        <div className="section-kicker">04 / WORD ON THE STREET</div>
        <div className="reviews-heading">
          <h2>Good taste<br /><em>travels.</em></h2>
          <p>What the Alpha community is saying.</p>
        </div>
        <div className="reviews-grid">
          {page.testimonials.map((review, index) => (
            <figure className="review-card" key={`${review.name}-${index}`}>
              <blockquote>“{review.quote}”</blockquote>
              <figcaption>{review.name}{review.isSample && <span className="sample-label">SAMPLE REVIEW</span>}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="faq-section section-shell">
        <div className="section-kicker">05 / GOOD TO KNOW</div>
        <div className="faq-layout">
          <h2>A few<br /><em>good questions.</em></h2>
          <div className="faq-list">
            {page.faqs.map((faq, index) => (
              <details key={`${faq.question}-${index}`}>
                <summary>{faq.question}<span aria-hidden="true">+</span></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="order-section" id="order">
        <div className="order-intro">
          <div className="section-kicker">MAKE YOUR MOVE</div>
          <h2>Your next<br /><em>signature.</em></h2>
          <p>{page.offerText}</p>
          <div className="order-product">
            <img src={product.imageUrl} alt="" loading="lazy" />
            <div><strong>{product.name}</strong><span>{product.category}</span></div>
            <strong>₹{product.price}</strong>
          </div>
        </div>
        <div className="order-form-wrap">
          {success ? (
            <div className="success-card" role="status">
              <span className="success-mark">✓</span>
              <p className="eyebrow">ORDER REQUEST RECEIVED</p>
              <h3>We’ll take it from here.</h3>
              <p>Your reference is <strong>{success}</strong>. Our team will reach out to confirm your order.</p>
              <p className="order-next-step">Payment and delivery options will be available in the next module.</p>
            </div>
          ) : (
            <>
              <p className="form-step">ONE QUICK STEP <span>01 / 01</span></p>
              <h3>Let’s make it yours.</h3>
              <p className="form-intro">Leave your details and we’ll confirm your order.</p>
              <form className="order-form" onSubmit={submitOrder}>
                <label>Full name<input autoComplete="name" name="fullName" onChange={updateForm} required value={form.fullName} maxLength="100" placeholder="Your name" /></label>
                <div className="form-row">
                  <label>Mobile number<input autoComplete="tel" inputMode="numeric" name="phone" onChange={updateForm} required value={form.phone} pattern="[0-9]{10}" maxLength="10" placeholder="10-digit number" /></label>
                  <label>Email <span className="optional-label">OPTIONAL</span><input autoComplete="email" name="email" onChange={updateForm} value={form.email} type="email" maxLength="254" placeholder="you@example.com" /></label>
                </div>
                <label>Delivery address<textarea autoComplete="street-address" name="address" onChange={updateForm} required value={form.address} maxLength="500" rows="2" placeholder="House, street, area" /></label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="button button-dark order-submit" disabled={submitting} type="submit">
                  {submitting ? "Sending your request…" : `Request my ${product.name}`} <span aria-hidden="true">↗</span>
                </button>
                <p className="privacy-note">No account needed. We’ll only use your details to follow up about this order.</p>
              </form>
            </>
          )}
        </div>
      </section>

      <footer className="site-footer">
        <a className="wordmark" href="/">ALPHA<span>MALE</span></a>
        <span>MUMBAI, INDIA · MADE FOR YOUR NEXT MOVE</span>
        <a href="mailto:info@alphamale.co.in">GET IN TOUCH ↗</a>
      </footer>

      {!success && <div className="sticky-cta"><span><strong>{product.name}</strong><small>₹{product.price} <s>₹{product.mrp}</s></small></span><a className="button button-dark" href="#order">Buy now <span aria-hidden="true">↗</span></a></div>}
    </main>
  );
}

function Admin({ navigate }) {
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

function ErrorScreen({ message }) {
  return <main className="error-screen"><span className="wordmark">ALPHA<span>MALE</span></span><h1>We can’t find this campaign.</h1><p>{message}</p><a className="button button-dark" href="/admin">Open campaign studio ↗</a></main>;
}
