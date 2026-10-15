import { Router } from "express";
import * as controller from "../controllers/apiController.js";

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

export default router;
