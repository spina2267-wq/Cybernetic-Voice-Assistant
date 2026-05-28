import { Router, type IRouter } from "express";
import healthRouter from "./health";
import voxRouter from "./vox";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/vox", voxRouter);

export default router;
