import { Router, type IRouter } from "express";
import healthRouter from "./health";
import renderingRouter from "./rendering";

const router: IRouter = Router();

router.use(healthRouter);
router.use(renderingRouter);

export default router;
