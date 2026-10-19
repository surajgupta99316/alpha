import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { captureFirstTouch } from "./attribution.js";
import { getExperimentVisitorId, getHeadlineVariant, trackCommerceEvent } from "./analytics.js";
import { updateSeoMetadata } from "./seo.js";

export default function CampaignPage({ slug }) {
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

                // Inject preload for the hero image to boost LCP
                const existingPreload = document.querySelector(`link[href="${data.heroImage}"]`);
                if (!existingPreload) {
                    const preloadLink = document.createElement("link");
                    preloadLink.rel = "preload";
                    preloadLink.as = "image";
                    preloadLink.fetchPriority = "high";
                    preloadLink.href = data.heroImage;
                    document.head.appendChild(preloadLink);
                }

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
                        src="https://images.unsplash.com/photo-1615634260167-c8cdede054de?auto=format&fit=crop&w=600&q=70"
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

function ErrorScreen({ message }) {
    return <main className="error-screen"><span className="wordmark">ALPHA<span>MALE</span></span><h1>We can’t find this campaign.</h1><p>{message}</p><a className="button button-dark" href="/admin">Open campaign studio ↗</a></main>;
}