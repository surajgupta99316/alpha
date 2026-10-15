import { Router } from "express";
import * as controller from "../controllers/apiController.js";
import * as storeController from "../controllers/storeController.js";
import { optionalCustomer, requireCustomer } from "../utils/customerAuth.js";

const router = Router();
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

router.get("/health", controller.getHealth);
router.get("/products", asyncRoute(controller.getProducts));
router.get("/landing-pages/:slug", asyncRoute(controller.getPublishedLandingPage));
router.get("/admin/landing-pages", asyncRoute(controller.getLandingPages));
router.post("/admin/landing-pages", asyncRoute(controller.createLandingPage));
router.put("/admin/landing-pages/:id", asyncRoute(controller.updateLandingPage));
router.get("/admin/orders", asyncRoute(controller.getOrders));
router.post("/orders", asyncRoute(controller.createOrder));

router.get("/store/products", asyncRoute(storeController.getStoreProducts));
router.get("/store/products/:slug", asyncRoute(storeController.getStoreProduct));
router.get("/serviceability/:code", asyncRoute(storeController.checkPincode));
router.get("/coupons", asyncRoute(storeController.getAvailableCoupons));
router.post("/coupons/validate", asyncRoute(storeController.validateCoupon));
router.post("/auth/otp/request", asyncRoute(storeController.requestLoginOtp));
router.post("/auth/otp/verify", asyncRoute(storeController.verifyLoginOtp));
router.get("/auth/me", requireCustomer, asyncRoute(storeController.getMyAccount));
router.get("/auth/orders", requireCustomer, asyncRoute(storeController.getMyOrders));
router.post("/store/checkout", optionalCustomer, asyncRoute(storeController.createCheckoutOrder));
router.get("/admin/coupons", asyncRoute(storeController.getAdminCoupons));
router.post("/admin/coupons", asyncRoute(storeController.createAdminCoupon));
router.put("/admin/coupons/:id", asyncRoute(storeController.updateAdminCoupon));

export default router;
