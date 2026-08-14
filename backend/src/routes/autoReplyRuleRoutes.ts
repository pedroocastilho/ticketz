import express from "express";
import isAuth from "../middleware/isAuth";

import * as AutoReplyRuleController from "../controllers/AutoReplyRuleController";

const autoReplyRuleRoutes = express.Router();

autoReplyRuleRoutes.get(
  "/auto-reply-rules",
  isAuth,
  AutoReplyRuleController.index
);

autoReplyRuleRoutes.post(
  "/auto-reply-rules",
  isAuth,
  AutoReplyRuleController.store
);

autoReplyRuleRoutes.put(
  "/auto-reply-rules/:id",
  isAuth,
  AutoReplyRuleController.update
);

autoReplyRuleRoutes.delete(
  "/auto-reply-rules/:id",
  isAuth,
  AutoReplyRuleController.remove
);

export default autoReplyRuleRoutes;
