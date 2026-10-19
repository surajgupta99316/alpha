import CouponAdmin from "./CouponAdmin.jsx";
import FulfilmentAdmin from "./FulfilmentAdmin.jsx";
import { PostPurchaseAdmin } from "./PostPurchase.jsx";
import CRMAdmin, { StaffGate } from "./CRMAdmin.jsx";

export default function AdminRoutes({ path, navigate, defaultScreen }) {
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
  else screen = defaultScreen;
  return <StaffGate path={path} navigate={navigate}>{screen}</StaffGate>;
}
