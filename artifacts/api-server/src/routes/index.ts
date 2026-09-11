import { Router, type IRouter } from "express";
import healthRouter from "./health";
import communityRouter from "./community";
import elevationRouter from "./elevation";
import authRouter from "./auth";
import meRouter from "./me";
import storageRouter from "./storage";
import blogRouter from "./blog";
import feedbackRouter from "./feedback";
import donateRouter from "./donate";
import sharedRouter from "./shared";
import leadsRouter from "./leads";
import { trailGuidesApiRouter } from "./trailGuides";
import projectsRouter from "./projects";
import supportRouter from "./support";
import liveActivitiesRouter from "./liveActivities";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(communityRouter);
router.use(elevationRouter);
// Anonymous recorders authenticate live activity writes with an owner
// capability, not an account session. This must run before the general /me
// router, which correctly requires an authenticated account for all of its
// own endpoints.
router.use(liveActivitiesRouter);
router.use(meRouter);
router.use(storageRouter);
router.use(blogRouter);
router.use(feedbackRouter);
router.use(donateRouter);
router.use(sharedRouter);
router.use(leadsRouter);
router.use(trailGuidesApiRouter);
router.use(projectsRouter);
router.use(supportRouter);

export default router;
