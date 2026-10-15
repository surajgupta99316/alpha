import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const FREE_SHIPPING_THRESHOLD = 1499;
const AUTH_KEY = "alpha:customer-token";
const COUPON_KEY = "alpha:cart-coupon";
const money = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

function StoreHeader({ cart, navigate }) {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const link = (path, text, className = "") => (
    <a className={className} href={path} onClick={(event) => { event.preventDefault(); navigate(path); }}>{text}</a>
  );
  return (
    <header className="store-header">
      {link("/", <>ALPHA<span>MALE</span></>, "store-wordmark")}
      <nav aria-label="Main navigation">{link("/products", "The collection")}{link("/account", "My account")}</nav>
      {link("/cart", <>Bag <span>{count}</span></>, "store-cart-link")}
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
      <section className="store-section store-featured">
        <div className="store-section-heading"><div><p className="store-eyebrow">THE SIGNATURE EDIT</p><h2>Find your <em>fragrance.</em></h2></div><a href="/products" onClick={(event) => { event.preventDefault(); navigate("/products"); }}>View all products ↗</a></div>
        {error ? <p className="store-error" role="alert">{error}</p> : <ProductGrid products={products.slice(0, 4)} navigate={navigate} addToCart={addToCart} />}
      </section>
    </>
  );
}

function ProductListing({ navigate, addToCart }) {
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("featured");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(["All"]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.getStoreProducts()
      .then((rows) => setCategories(["All", ...new Set(rows.map((product) => product.category))]))
      .catch((requestError) => setError(requestError.message));
  }, []);
  useEffect(() => {
    api.getStoreProducts({ category, sort, search })
      .then((rows) => { setProducts(rows); setError(""); })
      .catch((requestError) => setError(requestError.message));
  }, [category, sort, search]);
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
  if (error) return <div className="store-error-screen"><h1>{error}</h1><button className="store-button store-button-dark" onClick={() => navigate("/products")} type="button">Back to the collection ↗</button></div>;
  if (!product) return <div className="store-loading">Finding your next signature…</div>;
  const maxQuantity = Math.max(1, Math.min(10, product.stock));
  return (
    <section className="store-product-detail">
      <div className="detail-image"><img src={product.imageUrl} alt={product.name} /></div>
      <div className="detail-copy">
        <p className="store-eyebrow"><span /> {product.category}</p><h1>{product.name}<br /><em>made yours.</em></h1><p className="detail-description">{product.description}</p>
        <div className="detail-price"><strong>{money(product.price)}</strong><s>{money(product.mrp)}</s><span>Inclusive of all taxes</span></div>
        <p className="stock-note">{product.stock > 0 ? "Ready to make its mark." : "Currently out of stock."}</p>
        <div className="detail-quantity"><span>QUANTITY</span><button aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((current) => current - 1)} type="button">−</button><strong>{quantity}</strong><button aria-label="Increase quantity" disabled={quantity >= maxQuantity} onClick={() => setQuantity((current) => current + 1)} type="button">+</button></div>
        <button className="store-button store-button-dark detail-add" disabled={!product.stock} onClick={() => { addToCart(product, quantity); setAdded(true); }} type="button">{added ? "Added to your bag ✓" : "Add to bag"} <span>{money(product.price * quantity)} ↗</span></button>
        <PincodeCheck value={pincode} onChange={setPincode} />
      </div>
    </section>
  );
}

function FreeShippingBar({ subtotal }) {
  const progress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  return <div className="free-shipping"><div>{remaining ? <>You’re {money(remaining)} away from <strong>free shipping.</strong></> : <><strong>You’ve unlocked free shipping.</strong> A good choice.</>}</div><div className="shipping-track"><span style={{ width: `${progress}%` }} /></div></div>;
}

function FrequentlyBoughtTogether({ cart, addToCart }) {
  const { products } = useStoreProducts();
  const recommendations = useMemo(() => {
    const ids = cart.map((item) => item._id);
    return products.filter((item) => !ids.includes(item._id)).slice(0, 2);
  }, [products, cart]);
  if (!recommendations.length) return null;
  return (
    <section className="fbt-section"><div><p className="store-eyebrow">THE PAIRING NOTE</p><h2>Frequently bought <em>together.</em></h2></div><div className="fbt-items">{recommendations.map((product) => <article className="fbt-card" key={product._id}><img src={product.imageUrl} alt="" loading="lazy" /><div><strong>{product.name}</strong><span>{money(product.price)}</span></div><button onClick={() => addToCart(product)} type="button">+ Add</button></article>)}</div></section>
  );
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
  const shipping = afterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : 49;
  const total = afterDiscount + (cart.length ? shipping : 0);
  useEffect(() => {
    api.getCoupons().then(setCoupons).catch((error) => setCouponError(error.message));
  }, []);
  function changeQuantity(id, delta) {
    setCart((items) => items.map((item) => item._id === id
      ? { ...item, quantity: Math.max(1, Math.min(Math.min(10, item.stock), item.quantity + delta)) }
      : item));
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
  function addRecommended(product) {
    setCart((items) => {
      const existing = items.find((item) => item._id === product._id);
      return existing
        ? items.map((item) => item._id === product._id ? { ...item, quantity: Math.min(Math.min(10, item.stock), item.quantity + 1) } : item)
        : [...items, { ...product, quantity: 1 }];
    });
  }
  if (!cart.length) return <section className="store-empty-page"><span className="empty-bag-icon">✳</span><h1>Your bag is<br /><em>taking a break.</em></h1><p>Add a fragrance to your bag before checking out.</p><button className="store-button store-button-dark" onClick={() => navigate("/products")} type="button">Explore the collection <span>↗</span></button></section>;
  return (
    <section className="store-section cart-page">
      <p className="store-eyebrow"><span /> YOUR SELECTION</p><h1 className="store-page-title">The good <em>stuff.</em></h1>
      <div className="cart-layout">
        <div className="cart-items-column">
          <FreeShippingBar subtotal={afterDiscount} />
          <div className="cart-items">{cart.map((item) => <article className="cart-item" key={item._id}><a href={`/products/${item.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/products/${item.slug}`); }}><img src={item.imageUrl} alt={item.name} /></a><div className="cart-item-details"><a href={`/products/${item.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/products/${item.slug}`); }}><h2>{item.name}</h2></a><span>{item.category}</span><div className="cart-item-quantity"><button aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1} onClick={() => changeQuantity(item._id, -1)} type="button">−</button><span>{item.quantity}</span><button aria-label={`Increase ${item.name} quantity`} disabled={item.quantity >= Math.min(10, item.stock)} onClick={() => changeQuantity(item._id, 1)} type="button">+</button></div></div><div className="cart-item-price"><strong>{money(item.price * item.quantity)}</strong><s>{money(item.mrp * item.quantity)}</s><button onClick={() => setCart((items) => items.filter((row) => row._id !== item._id))} type="button">Remove</button></div></article>)}</div>
          <FrequentlyBoughtTogether cart={cart} addToCart={addRecommended} />
        </div>
        <aside className="cart-summary"><p className="store-eyebrow">ORDER SUMMARY</p><h2>The good stuff.</h2><div className="cart-summary-line"><span>Subtotal</span><span>{money(subtotal)}</span></div>{applied && <div className="cart-summary-line cart-discount"><span>Coupon · {applied.code}</span><span>−{money(discount)}</span></div>}<div className="cart-summary-line"><span>Shipping</span><span>{shipping ? money(shipping) : "FREE"}</span></div><div className="coupon-form-wrap"><label htmlFor="coupon-code">HAVE A CODE?</label><form className="coupon-form" onSubmit={applyCoupon}><input id="coupon-code" maxLength="30" onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Enter code" value={couponCode} /><button disabled={busy || !subtotal} type="submit">{busy ? "…" : applied ? "Applied ✓" : "Apply"}</button></form>{couponError && <p className="coupon-error" role="alert">{couponError}</p>}<div className="available-coupons">{coupons.filter((coupon) => subtotal >= coupon.minimumOrderValue).map((coupon) => <button key={coupon.code} onClick={() => setCouponCode(coupon.code)} type="button">{coupon.code} · {coupon.type === "percentage" ? `${coupon.value}% off` : `${money(coupon.value)} off`}</button>)}</div></div><div className="cart-summary-total"><strong>Total</strong><strong>{money(total)}</strong></div><p className="cart-tax-note">Tax included. Shipping calculated above.</p><button className="store-button store-button-dark checkout-button" onClick={() => navigate("/checkout")} type="button">Continue to checkout <span>↗</span></button><a className="keep-shopping" href="/products" onClick={(event) => { event.preventDefault(); navigate("/products"); }}>Keep exploring ↗</a><p className="payment-note">Secure checkout · Guest checkout available</p></aside>
      </div>
    </section>
  );
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
          setForm((current) => ({ ...current, city: result.serviceable ? result.city : "", state: result.serviceable ? result.state : "" }));
        })
        .catch((requestError) => { if (active) setPincodeResult({ serviceable: false, message: requestError.message }); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.pincode]);
  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === "phone" || name === "pincode" ? value.replace(/\D/g, "").slice(0, name === "phone" ? 10 : 6) : value }));
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
    <section className="store-section checkout-page"><p className="store-eyebrow"><span /> SECURE CHECKOUT</p><h1 className="store-page-title">Almost <em>yours.</em></h1><div className="checkout-layout"><form className="checkout-form" onSubmit={submit}><h2>Delivery details</h2><label>Full name<input autoComplete="name" maxLength="100" name="fullName" onChange={update} required value={form.fullName} /></label><div className="checkout-row"><label>Mobile number<input autoComplete="tel" inputMode="numeric" maxLength="10" name="phone" onChange={update} pattern="[0-9]{10}" required value={form.phone} /></label><label>Email <span className="optional-label">OPTIONAL</span><input autoComplete="email" maxLength="254" name="email" onChange={update} type="email" value={form.email} /></label></div><label>Delivery address<textarea autoComplete="street-address" maxLength="500" name="address" onChange={update} required rows="3" value={form.address} /></label><label>Pincode<input autoComplete="postal-code" inputMode="numeric" maxLength="6" name="pincode" onChange={update} pattern="[0-9]{6}" required value={form.pincode} /></label>{pincodeResult && <p className={pincodeResult.serviceable ? "pincode-success" : "pincode-error"} role="status">{pincodeResult.message}{pincodeResult.serviceable && ` · ${form.city}, ${form.state}`}</p>}{error && <p className="store-error" role="alert">{error}</p>}<button className="store-button store-button-dark checkout-button" disabled={submitting} type="submit">{submitting ? "Saving your order…" : "Place order"} <span>↗</span></button><p className="payment-note">No payment is collected now. Payment options will be available in Module 3.</p></form><aside className="checkout-summary"><p className="store-eyebrow">YOUR ORDER</p>{cart.map((item) => <div className="checkout-line" key={item._id}><span>{item.name} × {item.quantity}</span><strong>{money(item.price * item.quantity)}</strong></div>)}<div className="checkout-line"><span>Subtotal</span><span>{money(subtotal)}</span></div>{discount > 0 && <div className="checkout-line cart-discount"><span>Discount · {coupon.code}</span><span>−{money(discount)}</span></div>}<div className="checkout-line"><span>Shipping</span><span>{shipping ? money(shipping) : "FREE"}</span></div><div className="checkout-total"><strong>Total</strong><strong>{money(total)}</strong></div></aside></div></section>
  );
}

function CheckoutSuccess({ orderNumber, navigate }) {
  return <section className="store-empty-page checkout-success"><span className="empty-bag-icon">✓</span><p className="store-eyebrow">ORDER REQUEST RECEIVED</p><h1>We’ll take it<br /><em>from here.</em></h1><p>Your reference is <strong>{orderNumber}</strong>.</p><p className="payment-note">Your order is saved. Payment will be available in Module 3.</p><button className="store-button store-button-dark" onClick={() => navigate("/products")} type="button">Back to the collection ↗</button></section>;
}

function LoginAndAccount() {
  const [token, setToken] = useState(() => window.localStorage.getItem(AUTH_KEY) || "");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) return;
    Promise.all([api.getMyAccount(token), api.getMyOrders(token)])
      .then(([account, history]) => { setCustomer(account.customer); setOrders(history); })
      .catch((requestError) => { window.localStorage.removeItem(AUTH_KEY); setToken(""); setError(requestError.message); });
  }, [token]);
  async function requestCode(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try { const result = await api.requestOtp(phone); setRequested(true); setMessage(result.message); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.verifyOtp(phone, code);
      window.localStorage.setItem(AUTH_KEY, result.token);
      setToken(result.token);
      setCustomer(result.customer);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  function signOut() {
    window.localStorage.removeItem(AUTH_KEY);
    setToken(""); setCustomer(null); setOrders([]); setRequested(false);
  }
  if (token && customer) return (
    <section className="store-section account-page"><p className="store-eyebrow"><span /> YOUR ALPHA ACCOUNT</p><h1 className="store-page-title">Good to see you, <em>{customer.fullName || customer.phone}.</em></h1><button className="account-signout" onClick={signOut} type="button">Sign out</button><h2>Your orders</h2>{orders.length ? <div className="account-orders">{orders.map((order) => <article key={order._id}><div><strong>{order.orderNumber}</strong><span>{new Date(order.createdAt).toLocaleDateString("en-IN")}</span></div><strong>{money(order.amount)}</strong><span className="order-status">{order.status}</span></article>)}</div> : <p className="store-muted">Your orders will appear here after checkout.</p>}</section>
  );
  return (
    <section className="account-login"><p className="store-eyebrow"><span /> THE ALPHA ACCOUNT</p><h1>Good things<br /><em>start here.</em></h1><p>Sign in with your mobile number to see your order history.</p>{!requested ? <form className="account-form" onSubmit={requestCode}><label>Mobile number<input autoComplete="tel" inputMode="numeric" maxLength="10" onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} pattern="[0-9]{10}" required value={phone} /></label><button className="store-button store-button-dark" disabled={busy} type="submit">{busy ? "Sending…" : "Send verification code"} ↗</button></form> : <form className="account-form" onSubmit={verifyCode}><p>{message}</p><label>6-digit verification code<input autoComplete="one-time-code" inputMode="numeric" maxLength="6" onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required value={code} /></label><button className="store-button store-button-dark" disabled={busy} type="submit">{busy ? "Verifying…" : "Verify and sign in"} ↗</button></form>}{error && <p className="store-error" role="alert">{error}</p>}</section>
  );
}

export default function Storefront({ path, cart, setCart, navigate }) {
  const { products, error } = useStoreProducts();
  const addToCart = (product, quantity) => {
    setCart((items) => {
      const existing = items.find((item) => item._id === product._id);
      return existing
        ? items.map((item) => item._id === product._id ? { ...item, quantity: Math.min(Math.min(10, item.stock), item.quantity + quantity) } : item)
        : [...items, { ...product, quantity: Math.min(Math.min(10, product.stock), quantity) }];
    });
  };
  let page;
  if (path === "/") page = <StoreHome navigate={navigate} products={products} addToCart={addToCart} error={error} />;
  else if (path === "/products") page = <ProductListing navigate={navigate} addToCart={addToCart} />;
  else if (path === "/cart") page = <CartPage cart={cart} setCart={setCart} navigate={navigate} />;
  else if (path === "/checkout") page = <CheckoutPage cart={cart} setCart={setCart} navigate={navigate} />;
  else if (path.startsWith("/checkout/success/")) page = <CheckoutSuccess orderNumber={decodeURIComponent(path.slice("/checkout/success/".length))} navigate={navigate} />;
  else if (path === "/account") page = <LoginAndAccount />;
  else if (path.startsWith("/products/")) page = <ProductDetail slug={decodeURIComponent(path.slice("/products/".length))} navigate={navigate} addToCart={addToCart} />;
  else page = <div className="store-error-screen"><h1>We couldn’t find that page.</h1><button className="store-button store-button-dark" onClick={() => navigate("/")} type="button">Back to home ↗</button></div>;
  return <div className="store-shell"><StoreHeader cart={cart} navigate={navigate} /><main>{page}</main><footer className="store-footer"><a href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>ALPHA<span>MALE</span></a><span>MUMBAI, INDIA · MADE FOR YOUR NEXT MOVE</span><span>© ALPHA MALE</span></footer></div>;
}
