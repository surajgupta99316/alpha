import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const Storefront = lazy(() => import("./Storefront.jsx"));
const AdminRoutes = lazy(() => import("./AdminRoutes.jsx"));
const CampaignPage = lazy(() => import("./CampaignPage.jsx"));
const Admin = lazy(() => import("./Admin.jsx"));

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
    import('./analytics.js').then(({ trackPageView }) => {
      trackPageView(path);
    });
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
    return (
      <Suspense fallback={<div className="page-loading" role="status">Loading the campaign studio…</div>}>
        <AdminRoutes path={path} navigate={navigate} defaultScreen={<Admin navigate={navigate} />} />
      </Suspense>
    );
  }
  if (path.startsWith("/lp/")) {
    const slug = decodeURIComponent(path.slice(4));
    return (
      <Suspense fallback={<div className="page-loading" role="status">Loading campaign...</div>}>
        <CampaignPage key={slug} slug={slug} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<div className="page-loading" role="status">Loading the storefront…</div>}>
      <Storefront path={path} cart={cart} setCart={setCart} navigate={navigate} />
    </Suspense>
  );
}
