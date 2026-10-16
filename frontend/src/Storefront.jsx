import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { SupportPage, TrackingPage } from "./PostPurchase.jsx";

const FREE_SHIPPING_THRESHOLD = 1499;
const AUTH_KEY = "alpha:customer-token";
const COUPON_KEY = "alpha:cart-coupon";
const CHECKOUT_ORDER_KEY = "alpha:last-checkout";
const money = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  const source = "https://checkout.razorpay.com/v1/checkout.js";
  let script = document.querySelector(`script[src="${source}"]`);
  if (!script) {
    script = document.createElement("script");
    script.src = source;
    script.async = true;
    document.body.appendChild(script);
  }
  return new Promise((resolve, reject) => {
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("Razorpay checkout could not be loaded. Check your connection and retry.")), { once: true });
    if (window.Razorpay) resolve();
  });
}

function StoreHeader({ cart, navigate }) {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <header className="store-header">
      <a className="store-wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>ALPHA<span>MALE</span></a>
      <nav aria-label="Main navigation"><a href="/products" onClick={(event) => { event.preventDefault(); navigate("/products"); }}>The collection</a><a href="/track" onClick={(event) => { event.preventDefault(); navigate("/track"); }}>Track order</a><a href="/support" onClick={(event) => { event.preventDefault(); navigate("/support"); }}>Support</a><a href="/account" onClick={(event) => { event.preventDefault(); navigate("/account"); }}>My account</a></nav>
      <a className="store-cart-link" href="/cart" onClick={(event) => { event.preventDefault(); navigate("/cart"); }}>Bag <span>{count}</span></a>
    </header>
  );
}

function useStoreProducts() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.getStoreProducts()
      .then(setProducts)
      .catch((requestError) => setError(requestError.message));
  }, []);
  return { products, error };
}

function ProductCard({ product, navigate, addToCart }) {
  return (
    <article className="store-product-card">
      <a className="store-product-photo" href={`/products/${product.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/products/${product.slug}`); }}>
        <img src={product.imageUrl} alt={product.name} loading="lazy" />
        <span className="store-product-category">{product.category}</span>
      </a>
      <div className="store-product-info">
        <div><a href={`/products/${product.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/products/${product.slug}`); }}><h3>{product.name}</h3></a><span className="store-product-subtitle">A signature, made yours.</span></div>
        <div className="store-price">{money(product.price)} <s>{money(product.mrp)}</s></div>
      </div>
      <button className="store-add-button" onClick={() => addToCart(product, 1)} type="button">Add to bag <span aria-hidden="true">↗</span></button>
    </article>
  );
}

function ProductGrid({ products, navigate, addToCart }) {
  if (!products.length) return <div className="store-empty"><span>✳</span><h3>No products found.</h3><p>Try another search or category.</p></div>;
  return <div className="store-product-grid">{products.map((product) => <ProductCard key={product._id} product={product} navigate={navigate} addToCart={addToCart} />)}</div>;
}

function StoreHome({ navigate, products, addToCart, error }) {
  return (
    <>
      <section className="store-home-hero">
        <div className="store-home-copy">
          <p className="store-eyebrow"><span /> THE ALPHA COLLECTION</p>
          <h1>Your presence.<br /><em>Precedes you.</em></h1>
          <p>Thoughtful fragrances for the moves you make and the mark you leave.</p>
          <button className="store-button store-button-dark" onClick={() => navigate("/products")} type="button">Explore the collection <span>↗</span></button>
          <div className="store-home-proof"><span>✳</span> Four signatures. One unmistakable you.</div>
        </div>
        <div className="store-home-image"><img src={products[0]?.imageUrl || "https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1200&q=80"} alt="Discover the Alpha Male fragrance collection" fetchpriority="high" /></div>
        <span className="store-home-index">01 — THE COLLECTION / MUMBAI, INDIA</span>
      </section>
      <section className="store-section store-featured"><div className="store-section-heading"><div><p className="store-eyebrow">THE SIGNATURE EDIT</p><h2>Find your <em>fragrance.</em></h2></div><a href="/products" onClick={(event) => { event.preventDefault(); navigate("/products"); }}>View all products ↗</a></div>{error ? <p className="store-error" role="alert">{error}</p> : <ProductGrid products={products.slice(0, 4)} navigate={navigate} addToCart={addToCart} />}</section>
    </>
  );
}

function ProductListing({ navigate, cart, addToCart }) {
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("featured");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.getStoreProducts({ category, sort, search })
      .then((rows) => { setProducts(rows); setError(""); })
      .catch((requestError) => setError(requestError.message));
  }, [category, sort, search]);
  const categories = ["All", ...new Set(products.map((product) => product.category))];
  return (
    <section className="store-section store-collection">
      <p className="store-eyebrow"><span /> THE COLLECTION</p><h1 className="store-page-title">Find your <em>fragrance.</em></h1>
      <div className="store-collection-tools"><div className="store-category-filter" aria-label="Filter by category">{categories.map((name) => <button className={category === name ? "active" : ""} key={name} onClick={() => setCategory(name)} type="button">{name}</button>)}</div><div className="store-filter-controls"><input aria-label="Search products" onChange={(event) => setSearch(event.target.value)} placeholder="Search fragrances" value={search} /><select aria-label="Sort products" onChange={(event) => setSort(event.target.value)} value={sort}><option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name</option></select></div></div>
      {error ? <p className="store-error" role="alert">{error}</p> : <ProductGrid products={products} navigate={navigate} addToCart={addToCart} />}
    </section>
  );
}

function PincodeCheck({ value, onChange }) {
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setResult(null);
    if (!/^[0-9]{6}$/.test(value)) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      setChecking(true);
      api.checkPincode(value)
        .then((data) => { if (active) setResult(data); })
        .catch((error) => { if (active) setResult({ serviceable: false, message: error.message }); })
        .finally(() => { if (active) setChecking(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [value]);
  return (
    <div className="pincode-check">
      <label htmlFor="delivery-pincode">CHECK DELIVERY TO</label>
      <div className="pincode-input"><input id="delivery-pincode" inputMode="numeric" maxLength="6" onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit pincode" value={value} /><span>{checking ? "Checking…" : "↗"}</span></div>
      {result && <p className={result.serviceable ? "pincode-success" : "pincode-error"} role="status">{result.message}{result.serviceable && <span> · {result.city}, {result.state}</span>}</p>}
      {!result && value.length > 0 && value.length < 6 && <p className="pincode-help">Enter all 6 digits to check delivery.</p>}
    </div>
  );
}

function ProductDetail({ slug, navigate, addToCart }) {
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pincode, setPincode] = useState("");
  const [added, setAdded] = useState(false);
  useEffect(() => {
    api.getStoreProduct(slug).then(setProduct).catch((requestError) => setError(requestError.message));
  }, [slug]);
  if (error) return <div className="store-error-screen"><h1>{error}</h1><a href="/products" onClick={(event) => { event.preventDefault(); navigate("/products"); }}>Back to the collection ↗</a></div>;
  if (!product) return <div className="store-loading">Finding your signature…</div>;
  function add() {
    addToCart(product, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }
  return (
    <div className="store-detail-page">
      <div className="store-breadcrumb"><a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>Home</a><span>/</span><a href="/products" onClick={(event) => { event.preventDefault(); navigate("/products"); }}>Collection</a><span>/</span>{product.name}</div>
      <section className="store-product-detail">
        <div className="store-detail-image"><img src={product.imageUrl} alt={product.name} fetchpriority="high" /><span>{product.category}</span></div>
        <div className="store-detail-copy"><p className="store-eyebrow"><span /> THE ALPHA SIGNATURE</p><h1>{product.name}</h1><p className="store-detail-description">{product.description} A confident fragrance, carefully composed to stay with you through the day.</p><div className="store-detail-price"><strong>{money(product.price)}</strong><s>{money(product.mrp)}</s><span>{Math.round((1 - product.price / product.mrp) * 100)}% OFF</span></div><p className="store-tax-note">Inclusive of all taxes</p><div className="store-quantity"><span>QUANTITY</span><div><button aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((count) => count - 1)} type="button">−</button><strong>{quantity}</strong><button aria-label="Increase quantity" disabled={quantity >= Math.min(10, product.stock)} onClick={() => setQuantity((count) => count + 1)} type="button">+</button></div></div><button className="store-button store-button-dark store-detail-add" disabled={product.stock < 1} onClick={add} type="button">{product.stock < 1 ? "Currently sold out" : added ? "Added to your bag ✓" : "Add to bag"} <span>{money(product.price * quantity)} ↗</span></button><PincodeCheck value={pincode} onChange={setPincode} /><p className="store-stock-note">{product.stock > 0 ? "Thoughtfully made. Ready to ship." : "This fragrance is currently sold out."}</p></div>
      </section>
    </div>
  );
}

function FreeShippingBar({ subtotal }) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const progress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  return <div className="free-shipping"><div><span>{remaining ? <>You’re {money(remaining)} away from free shipping.</> : <>You unlocked <strong>free shipping.</strong> ✳</>}</span><span>{money(Math.min(subtotal, FREE_SHIPPING_THRESHOLD))} / {money(FREE_SHIPPING_THRESHOLD)}</span></div><div className="free-shipping-track"><span style={{ width: `${progress}%` }} /></div></div>;
}

function CartPage({ cart, setCart, navigate }) {
  const [couponCode, setCouponCode] = useState(() => window.localStorage.getItem(COUPON_KEY) || "");
  const [applied, setApplied] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [busy, setBusy] = useState(false);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = applied?.discount || 0;
  const afterDiscount = subtotal - discount;
  const shipping = cart.length && afterDiscount < FREE_SHIPPING_THRESHOLD ? 49 : 0;
  useEffect(() => {
    api.getCoupons().then(setCoupons).catch((error) => console.error("Could not load available coupons.", error));
    if (couponCode && subtotal > 0) {
      api.validateCoupon(couponCode, subtotal)
        .then(setApplied)
        .catch(() => { setApplied(null); window.localStorage.removeItem(COUPON_KEY); });
    }
  }, []);
  useEffect(() => {
    if (!applied) return;
    api.validateCoupon(applied.code, subtotal)
      .then(setApplied)
      .catch(() => { setApplied(null); setCouponError("This coupon no longer applies to your cart."); window.localStorage.removeItem(COUPON_KEY); });
  }, [subtotal]);
  function changeQuantity(id, delta) {
    setCart((items) => items.map((item) => item._id === id ? { ...item, quantity: Math.max(1, Math.min(Math.min(10, item.stock), item.quantity + delta)) } : item));
  }
  async function applyCoupon(event) {
    event.preventDefault();
    setBusy(true);
    setCouponError("");
    try {
      const result = await api.validateCoupon(couponCode, subtotal);
      setApplied(result);
      window.localStorage.setItem(COUPON_KEY, result.code);
    } catch (error) {
      setApplied(null);
      window.localStorage.removeItem(COUPON_KEY);
      setCouponError(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length) return <section className="store-empty-page"><p className="store-eyebrow">YOUR BAG / 00</p><span className="empty-bag-icon">✳</span><h1>Your next signature<br /><em>is waiting.</em></h1><p>Your bag is taking a quiet moment. Let’s find something that feels like you.</p><button className="store-button store-button-dark" onClick={() => navigate("/products")} type="button">Explore the collection <span>↗</span></button></section>;
  const total = afterDiscount + shipping;
  const recommendations = cart[0]._id;
  return (
    <section className="store-section cart-page">
      <p className="store-eyebrow"><span /> YOUR BAG / {String(cart.reduce((sum, item) => sum + item.quantity, 0)).padStart(2, "0")}</p><h1 className="store-page-title">A good choice.</h1>
      <div className="cart-layout">
        <div className="cart-items-column"><FreeShippingBar subtotal={afterDiscount} /><div className="cart-items">{cart.map((item) => <article className="cart-item" key={item._id}><a href={`/products/${item.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/products/${item.slug}`); }}><img src={item.imageUrl} alt={item.name} /></a><div className="cart-item-details"><a href={`/products/${item.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/products/${item.slug}`); }}><h2>{item.name}</h2></a><span>{item.category}</span><div className="cart-item-quantity"><button aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1} onClick={() => changeQuantity(item._id, -1)} type="button">−</button><span>{item.quantity}</span><button aria-label={`Increase ${item.name} quantity`} disabled={item.quantity >= Math.min(10, item.stock)} onClick={() => changeQuantity(item._id, 1)} type="button">+</button></div></div><div className="cart-item-price"><strong>{money(item.price * item.quantity)}</strong><s>{money(item.mrp * item.quantity)}</s><button onClick={() => setCart((items) => items.filter((row) => row._id !== item._id))} type="button">Remove</button></div></article>)}</div>
          <FrequentlyBoughtTogether products={cart} currentId={recommendations} addToCart={(product) => setCart((items) => { const existing = items.find((item) => item._id === product._id); return existing ? items.map((item) => item._id === product._id ? { ...item, quantity: Math.min(10, item.quantity + 1) } : item) : [...items, { ...product, quantity: 1 }]; })} />
        </div>
        <aside className="cart-summary"><p className="store-eyebrow">ORDER SUMMARY</p><h2>The good stuff.</h2><div className="cart-summary-line"><span>Subtotal</span><span>{money(subtotal)}</span></div>{applied && <div className="cart-summary-line cart-discount"><span>Coupon · {applied.code}</span><span>−{money(discount)}</span></div>}<div className="cart-summary-line"><span>Shipping</span><span>{shipping ? money(shipping) : "FREE"}</span></div><div className="coupon-form-wrap"><label htmlFor="coupon-code">HAVE A CODE?</label><form className="coupon-form" onSubmit={applyCoupon}><input id="coupon-code" maxLength="30" onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Enter code" value={couponCode} /><button disabled={busy || !subtotal} type="submit">{busy ? "…" : applied ? "Applied ✓" : "Apply"}</button></form>{couponError && <p className="coupon-error" role="alert">{couponError}</p>}<div className="available-coupons">{coupons.filter((coupon) => subtotal >= coupon.minimumOrderValue).map((coupon) => <button key={coupon.code} onClick={() => setCouponCode(coupon.code)} type="button">{coupon.code} · {coupon.type === "percentage" ? `${coupon.value}% off` : `${money(coupon.value)} off`}</button>)}</div></div><div className="cart-summary-total"><strong>Total</strong><strong>{money(total)}</strong></div><p className="cart-tax-note">Tax included. Shipping calculated above.</p><button className="store-button store-button-dark checkout-button" onClick={() => navigate("/checkout")} type="button">Continue to checkout <span>↗</span></button><a className="keep-shopping" href="/products" onClick={(event) => { event.preventDefault(); navigate("/products"); }}>Keep exploring ↗</a><p className="payment-note">Secure checkout · Guest checkout available</p></aside>
      </div>
    </section>
  );
}

function FrequentlyBoughtTogether({ products, currentId, addToCart }) {
  const { products: allProducts } = useStoreProducts();
  const recommendations = useMemo(() => {
    const ids = products.map((item) => item._id);
    const next = allProducts.filter((item) => !ids.includes(item._id)).slice(0, 2);
    return next;
  }, [allProducts, products, currentId]);
  if (!recommendations.length) return null;
  return <section className="fbt-section"><div><p className="store-eyebrow">THE PAIRING NOTE</p><h2>Frequently bought <em>together.</em></h2></div><div className="fbt-items">{recommendations.map((product) => <article className="fbt-card" key={product._id}><img src={product.imageUrl} alt="" loading="lazy" /><div><strong>{product.name}</strong><span>{money(product.price)}</span></div><button onClick={() => addToCart(product)} type="button">+ Add</button></article>)}</div></section>;
}

function CheckoutPage({ cart, setCart, navigate }) {
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", address: "", pincode: "", city: "", state: "" });
  const [pincodeResult, setPincodeResult] = useState(null);
  const [couponCode] = useState(() => window.localStorage.getItem(COUPON_KEY) || "");
  const [coupon, setCoupon] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const token = window.localStorage.getItem(AUTH_KEY);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = coupon?.discount || 0;
  const shipping = subtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : 49;
  const total = subtotal - discount + (cart.length ? shipping : 0);

  useEffect(() => {
    if (couponCode && subtotal) api.validateCoupon(couponCode, subtotal).then(setCoupon).catch(() => setCoupon(null));
  }, [couponCode, subtotal]);
  useEffect(() => {
    if (!token) return;
    api.getMyAccount(token)
      .then(({ customer }) => setForm((current) => ({
        ...current,
        fullName: customer.fullName || current.fullName,
        phone: customer.phone || current.phone,
        email: customer.email || current.email,
      })))
      .catch(() => window.localStorage.removeItem(AUTH_KEY));
  }, [token]);
  useEffect(() => {
    setPincodeResult(null);
    if (!/^[0-9]{6}$/.test(form.pincode)) {
      setForm((current) => ({ ...current, city: "", state: "" }));
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      api.checkPincode(form.pincode)
        .then((result) => {
          if (!active) return;
          setPincodeResult(result);
          if (result.serviceable) {
            setForm((current) => ({ ...current, city: result.city, state: result.state }));
          } else {
            setForm((current) => ({ ...current, city: "", state: "" }));
          }
        })
        .catch((requestError) => { if (active) setPincodeResult({ serviceable: false, message: requestError.message }); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.pincode]);
  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }
  async function submit(event) {
    event.preventDefault();
    if (!cart.length) { setError("Your cart is empty."); return; }
    if (!pincodeResult?.serviceable || !form.city || !form.state) { setError("Enter a serviceable delivery pincode."); return; }
    setSubmitting(true);
    setError("");
    try {
      const checkoutToken = window.crypto.randomUUID();
      const result = await api.createCheckoutOrder({
        checkoutToken,
        items: cart.map(({ _id, quantity }) => ({ productId: _id, quantity })),
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        address: form.address,
        pincode: form.pincode,
        couponCode: coupon?.code || "",
      }, token);
      window.localStorage.setItem(CHECKOUT_ORDER_KEY, JSON.stringify({
        orderNumber: result.orderNumber,
        checkoutToken: result.checkoutToken,
      }));
      setCart([]);
      window.localStorage.removeItem(COUPON_KEY);
      navigate(`/checkout/success/${encodeURIComponent(result.orderNumber)}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }
  if (!cart.length) return <section className="store-empty-page"><span className="empty-bag-icon">✳</span><h1>Your bag is<br /><em>taking a break.</em></h1><p>Add a fragrance to your bag before checking out.</p><button className="store-button store-button-dark" onClick={() => navigate("/products")} type="button">Explore the collection <span>↗</span></button></section>;
  return (
    <section className="store-section checkout-page"><div className="store-breadcrumb"><a href="/cart" onClick={(event) => { event.preventDefault(); navigate("/cart"); }}>Your bag</a><span>/</span>Checkout</div><div className="checkout-layout"><div><p className="store-eyebrow"><span /> ONE LAST STEP</p><h1 className="store-page-title">Make it <em>yours.</em></h1><p className="checkout-lede">Delivery details, then we’ll take it from here.</p><form className="checkout-form" onSubmit={submit}><div className="checkout-form-heading"><span>01</span><div><strong>Who’s receiving it?</strong><small>Guest checkout is ready. No account required.</small></div><a href="/account" onClick={(event) => { event.preventDefault(); navigate("/account"); }}>{token ? "Account ↗" : "Sign in ↗"}</a></div><label>Full name<input autoComplete="name" maxLength="100" name="fullName" onChange={update} required value={form.fullName} placeholder="Your name" /></label><div className="checkout-fields-row"><label>Mobile number<input autoComplete="tel" inputMode="numeric" maxLength="10" name="phone" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))} pattern="[0-9]{10}" required value={form.phone} placeholder="10-digit number" /></label><label>Email <span className="store-optional">OPTIONAL</span><input autoComplete="email" maxLength="254" name="email" onChange={update} type="email" value={form.email} placeholder="you@example.com" /></label></div><label>Street address<textarea autoComplete="street-address" maxLength="500" name="address" onChange={update} required rows="3" value={form.address} placeholder="Flat, house number, street, area" /></label><label>Pincode<input autoComplete="postal-code" inputMode="numeric" maxLength="6" name="pincode" onChange={(event) => setForm((current) => ({ ...current, pincode: event.target.value.replace(/\D/g, "").slice(0, 6) }))} pattern="[0-9]{6}" required value={form.pincode} placeholder="6-digit pincode" /></label>{pincodeResult && <p className={pincodeResult.serviceable ? "pincode-success" : "pincode-error"} role="status">{pincodeResult.message}</p>}<div className="checkout-fields-row"><label>City<input name="city" readOnly required value={form.city} placeholder="Auto-filled from pincode" /></label><label>State<input name="state" readOnly required value={form.state} placeholder="Auto-filled from pincode" /></label></div>{error && <p className="store-error" role="alert">{error}</p>}<button className="store-button store-button-dark checkout-place-order" disabled={submitting || !pincodeResult?.serviceable} type="submit">{submitting ? "Saving your checkout…" : "Place order request"} <span>↗</span></button><p className="checkout-disclaimer">This creates a checkout order request. Online payment will be added in Module 3.</p></form></div><aside className="checkout-summary"><p className="store-eyebrow">YOUR SELECTION</p><h2>A signature edit.</h2>{cart.map((item) => <div className="checkout-summary-item" key={item._id}><img src={item.imageUrl} alt="" /><div><strong>{item.name}</strong><span>Qty {item.quantity} · {money(item.price)} each</span></div><strong>{money(item.price * item.quantity)}</strong></div>)}<FreeShippingBar subtotal={subtotal - discount} /><div className="cart-summary-line"><span>Subtotal</span><span>{money(subtotal)}</span></div>{coupon && <div className="cart-summary-line cart-discount"><span>Coupon · {coupon.code}</span><span>−{money(discount)}</span></div>}<div className="cart-summary-line"><span>Shipping</span><span>{shipping ? money(shipping) : "FREE"}</span></div><div className="cart-summary-total"><strong>Total</strong><strong>{money(total)}</strong></div><p className="payment-note">All prices in Indian rupees. No payment is collected yet.</p></aside></div></section>
  );
}

function LoginAndAccount({ navigate }) {
  const [token, setToken] = useState(() => window.localStorage.getItem(AUTH_KEY) || "");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) return;
    Promise.all([api.getMyAccount(token), api.getMyOrders(token)])
      .then(([account, history]) => { setCustomer(account.customer); setOrders(history); })
      .catch((requestError) => {
        setError(requestError.message);
        window.localStorage.removeItem(AUTH_KEY);
        setToken("");
      });
  }, [token]);
  async function requestCode(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.requestOtp(phone);
      setRequested(true);
      setNotice(result.message);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await api.verifyOtp(phone, code);
      window.localStorage.setItem(AUTH_KEY, result.token);
      setCustomer(result.customer);
      setToken(result.token);
      setRequested(false);
      setNotice("You’re signed in.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  function signOut() {
    window.localStorage.removeItem(AUTH_KEY);
    setToken(""); setCustomer(null); setOrders([]); setCode(""); setRequested(false); setNotice("You’ve signed out.");
  }
  return (
    <section className="store-section account-page">
      <p className="store-eyebrow"><span /> YOUR ALPHA ACCOUNT</p>
      <h1 className="store-page-title">The story so <em>far.</em></h1>
      {error && <p className="store-error" role="alert">{error}</p>}
      {notice && <p className="account-notice" role="status">{notice}</p>}
      {customer ? (
        <>
          <div className="account-welcome">
            <div><span>GOOD TO HAVE YOU BACK</span><h2>{customer.fullName || customer.phone}</h2></div>
            <button className="store-button store-button-outline" onClick={signOut} type="button">Sign out</button>
          </div>
          <h2 className="account-orders-title">Your orders <span>{orders.length}</span></h2>
          {orders.length ? (
            <div className="account-order-list">
              {orders.map((order) => (
                <article className="account-order-card" key={order._id}>
                  <div className="account-order-top">
                    <strong>{order.orderNumber}</strong>
                    <span>{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className="account-order-status">{order.status} · {order.paymentMethod || "Payment pending"}</span>
                  </div>
                  {(order.items?.length ? order.items : order.product ? [{ ...order.product, lineTotal: order.amount }] : []).map((item, index) => (
                    <div className="account-order-item" key={`${order._id}-${index}`}>
                      <span>{item.name} × {item.quantity}</span>
                      <strong>{money(item.lineTotal ?? item.unitPrice * item.quantity)}</strong>
                    </div>
                  ))}
                  <div className="account-order-total"><span>Order total</span><strong>{money(order.amount)}</strong></div>
                  {["PendingPayment", "Failed", "CODPendingConfirmation", "CODConfirmed"].includes(order.status)
                    && order.paymentStatus !== "partially_paid"
                    && <button className="account-payment-link" onClick={() => navigate(`/checkout/success/${encodeURIComponent(order.orderNumber)}`)} type="button">
                      {order.status === "Failed" ? "Retry payment / choose delivery ↗" : order.status === "CODConfirmed" ? "Convert COD to prepaid ↗" : "Choose payment method ↗"}
                    </button>}
                </article>
              ))}
            </div>
          ) : (
            <div className="account-no-orders"><p>Your order story starts with one good choice.</p><button className="store-button store-button-dark" onClick={() => navigate("/products")} type="button">Explore the collection ↗</button></div>
          )}
        </>
      ) : (
        <div className="account-login-layout">
          <div className="account-login-note"><span>✳</span><h2>Your orders,<br /><em>all in one place.</em></h2><p>Sign in with your mobile number to see your order history. No password, no fuss.</p></div>
          <form className="account-login-card" onSubmit={requested ? verifyCode : requestCode}>
            <p className="store-eyebrow">{requested ? "02 / VERIFY IT’S YOU" : "01 / YOUR MOBILE NUMBER"}</p>
            <h2>{requested ? "One little code." : "Welcome back."}</h2>
            <label>Mobile number<input autoComplete="tel" disabled={requested} inputMode="numeric" maxLength="10" onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} pattern="[0-9]{10}" required value={phone} placeholder="10-digit number" /></label>
            {requested && <label>6-digit verification code<input autoComplete="one-time-code" inputMode="numeric" maxLength="6" onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required value={code} placeholder="Enter the code" /></label>}
            <button className="store-button store-button-dark" disabled={busy} type="submit">{busy ? "Just a moment…" : requested ? "Verify & sign in" : "Send one-time code"} <span>↗</span></button>
            {requested && <button className="account-change-number" onClick={() => { setRequested(false); setCode(""); setError(""); }} type="button">Change mobile number</button>}
            <p className="account-privacy">One-time codes expire in 5 minutes and can only be used once.</p>
          </form>
        </div>
      )}
    </section>
  );
}

function CheckoutSuccess({ orderNumber, navigate }) {
  const [summary, setSummary] = useState(null);
  const [checkoutToken, setCheckoutToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [codConfirmed, setCodConfirmed] = useState(false);
  const customerToken = window.localStorage.getItem(AUTH_KEY);

  async function refreshOrder(token = checkoutToken) {
    const result = await api.getPaymentSummary(
      { orderNumber, ...(token ? { checkoutToken: token } : {}) },
      customerToken,
    );
    setSummary(result);
    return result;
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CHECKOUT_ORDER_KEY) || "{}");
      setCheckoutToken(saved.orderNumber === orderNumber ? saved.checkoutToken || "" : "");
    } catch (storageError) {
      console.error("Could not read this checkout’s local reference.", storageError);
    }
  }, [orderNumber]);

  useEffect(() => {
    if (!checkoutToken && !customerToken) return;
    refreshOrder().catch((requestError) => setError(requestError.message));
  }, [checkoutToken, customerToken, orderNumber]);

  async function startOnlinePayment(mode) {
    setBusy(true); setError(""); setNotice("");
    try {
      const paymentOrder = await api.createRazorpayOrder({
        orderNumber,
        ...(checkoutToken ? { checkoutToken } : {}),
        mode,
      }, customerToken);
      setSummary(paymentOrder.summary);
      await loadRazorpayCheckout();
      const checkout = new window.Razorpay({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: "Alpha Male",
        description: mode === "partial_cod" ? "Partial COD deposit" : "Secure prepaid checkout",
        order_id: paymentOrder.razorpayOrderId,
        handler: async (gatewayResponse) => {
          setBusy(true);
          try {
            const result = await api.verifyRazorpayPayment({
              orderNumber,
              ...(checkoutToken ? { checkoutToken } : {}),
              razorpayOrderId: gatewayResponse.razorpay_order_id,
              razorpayPaymentId: gatewayResponse.razorpay_payment_id,
              razorpaySignature: gatewayResponse.razorpay_signature,
            }, customerToken);
            setSummary(result);
            setNotice(result.paymentStatus === "partially_paid"
              ? "Deposit confirmed. Your remaining balance is due on delivery."
              : "Payment verified. Your order is confirmed.");
          } catch (requestError) {
            setError(requestError.message);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setNotice("Payment was not completed. Your order is saved and you can retry.") },
      });
      checkout.on("payment.failed", (failure) => {
        setNotice(failure.error?.description || "Payment failed. Your order is saved and you can retry.");
      });
      checkout.open();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCod() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.confirmCashOnDelivery({
        orderNumber,
        ...(checkoutToken ? { checkoutToken } : {}),
        confirmed: codConfirmed,
      }, customerToken);
      setSummary(result);
      setNotice("COD order confirmed. Please pay the delivery amount when it arrives.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const canPayOnline = summary && ["PendingPayment", "Failed", "CODPendingConfirmation"].includes(summary.status);
  const orderTotal = summary?.orderTotal ?? summary?.amount ?? 0;
  const attemptPending = summary?.status === "PendingPayment"
    && summary.paymentStatus === "created"
    && ["prepaid", "partial_cod"].includes(summary.paymentMethod);
  const onlineMode = attemptPending ? summary.paymentMethod : "prepaid";
  const canConfirmCod = canPayOnline && !attemptPending && orderTotal <= summary.codLimit;
  const partialCodAmount = summary ? Math.ceil((orderTotal * 25) / 100) : 0;
  const canPartialCod = canPayOnline && !attemptPending && orderTotal - partialCodAmount <= summary.codLimit;
  const isComplete = summary?.status === "Paid"
    || (summary?.status === "CODConfirmed" && ["cod_pending", "partially_paid"].includes(summary.paymentStatus));

  return (
    <section className="store-section checkout-page checkout-success">
      <p className="store-eyebrow"><span /> ORDER {isComplete ? "CONFIRMED" : "RECEIVED"}</p>
      <h1 className="store-page-title">{isComplete ? <>It’s <em>official.</em></> : <>One last <em>choice.</em></>}</h1>
      <p className="checkout-lede">Order reference <strong>{orderNumber}</strong></p>
      {!summary && !error && <p className="payment-note">Loading your secure payment options…</p>}
      {summary && <div className="payment-order-summary">
        <div><span>Order total</span><strong>{money(summary.orderTotal)}</strong></div>
        {summary.couponDiscount > 0 && <div><span>Coupon discount</span><strong>−{money(summary.couponDiscount)}</strong></div>}
        {summary.prepaidDiscount > 0 && <div><span>Prepaid saving</span><strong>−{money(summary.prepaidDiscount)}</strong></div>}
        {summary.amountPaid > 0 && <div><span>Paid online</span><strong>{money(summary.amountPaid)}</strong></div>}
        {summary.codDue > 0 && <div><span>Due on delivery</span><strong>{money(summary.codDue)}</strong></div>}
        <div><span>Order status</span><strong>{summary.status}</strong></div>
      </div>}
      {notice && <p className="account-notice" role="status">{notice}</p>}
      {error && <p className="store-error" role="alert">{error}</p>}
      {canPayOnline && <div className="payment-choice-list">
        <article><div><strong>{attemptPending && onlineMode === "partial_cod" ? "Continue deposit payment" : "Pay online"}</strong><span>{onlineMode === "partial_cod" ? `Pay ${money(summary.paymentAmount)} now; ${money(summary.codDue)} COD` : "Secure Razorpay checkout · save 5% prepaid"}</span></div><button className="store-button store-button-dark" disabled={busy} onClick={() => startOnlinePayment(onlineMode)} type="button">{busy ? "Please wait…" : attemptPending ? "Retry payment" : `Pay ${money(orderTotal - Math.floor(orderTotal * 0.05))}`} ↗</button></article>
        {canPartialCod && <article><div><strong>Pay a deposit, rest on delivery</strong><span>Pay {money(partialCodAmount)} now; {money(orderTotal - partialCodAmount)} COD</span></div><button className="store-button store-button-outline" disabled={busy} onClick={() => startOnlinePayment("partial_cod")} type="button">Choose partial COD ↗</button></article>}
        {canConfirmCod && <article className="cod-choice"><div><strong>Cash on delivery</strong><span>COD is available for orders up to {money(summary.codLimit)}.</span></div><label><input checked={codConfirmed} onChange={(event) => setCodConfirmed(event.target.checked)} type="checkbox" /> I confirm I’ll pay on delivery.</label><button className="store-button store-button-outline" disabled={busy || !codConfirmed} onClick={confirmCod} type="button">Confirm COD ↗</button></article>}
        {!canConfirmCod && !canPartialCod && <p className="payment-note">This order is above the COD limit. Choose prepaid checkout.</p>}
      </div>}
      {isComplete && <div className="payment-complete">
        <span className="empty-bag-icon">✓</span>
        <p>{summary.status === "Paid" ? "Payment verified. Your order is confirmed." : summary.paymentStatus === "partially_paid" ? "Your deposit is confirmed; the balance is due on delivery." : "Your COD order is confirmed."}</p>
        {summary.status === "CODConfirmed" && summary.paymentStatus === "cod_pending" && <button className="store-button store-button-dark" disabled={busy} onClick={() => startOnlinePayment("prepaid")} type="button">Convert COD to prepaid · save 5% ↗</button>}
      </div>}
      <button className="store-button store-button-outline" onClick={() => navigate("/account")} type="button">View your account <span>↗</span></button>
      <p className="checkout-disclaimer">Stock is reduced once payment succeeds or COD is confirmed. Online orders are processed in Razorpay test mode.</p>
    </section>
  );
}

export default function Storefront({ path, cart, setCart, navigate }) {
  const { products, error } = useStoreProducts();
  function addToCart(product, quantity = 1) {
    setCart((items) => {
      const current = items.find((item) => item._id === product._id);
      if (current) return items.map((item) => item._id === product._id ? { ...item, quantity: Math.min(Math.min(10, product.stock), item.quantity + quantity) } : item);
      return [...items, { ...product, quantity: Math.min(Math.min(10, product.stock), quantity) }];
    });
  }
  const successMatch = path.match(/^\/checkout\/success\/([^/]+)$/);
  const productMatch = path.match(/^\/products\/([^/]+)$/);
  let content;
  if (successMatch) {
    content = <CheckoutSuccess orderNumber={decodeURIComponent(successMatch[1])} navigate={navigate} />;
  } else if (path === "/cart") {
    content = <CartPage cart={cart} setCart={setCart} navigate={navigate} />;
  } else if (path === "/checkout") {
    content = <CheckoutPage cart={cart} setCart={setCart} navigate={navigate} />;
  } else if (path === "/account") {
    content = <LoginAndAccount navigate={navigate} />;
  } else if (path === "/track") {
    content = <TrackingPage />;
  } else if (path === "/support") {
    content = <SupportPage />;
  } else if (productMatch) {
    content = <ProductDetail slug={decodeURIComponent(productMatch[1])} navigate={navigate} addToCart={addToCart} />;
  } else if (path === "/products") {
    content = <ProductListing navigate={navigate} cart={cart} addToCart={addToCart} />;
  } else {
    content = <StoreHome navigate={navigate} products={products} addToCart={addToCart} error={error} />;
  }
  return <main className="storefront"><StoreHeader cart={cart} navigate={navigate} />{content}<footer className="store-footer"><a className="store-wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>ALPHA<span>MALE</span></a><span>MUMBAI, INDIA · MADE FOR YOUR NEXT MOVE</span><a href="mailto:info@alphamale.co.in">GET IN TOUCH ↗</a></footer></main>;
}
