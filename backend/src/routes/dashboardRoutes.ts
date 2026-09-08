import express from "express";
import isAuth from "../middleware/isAuth";

import * as DashboardController from "../controllers/DashboardController";
import isAdminOrSupervisor from "../middleware/isAdminOrSupervisor";
import isCompliant from "../middleware/isCompliant";

const routes = express.Router();

routes.get(
  "/dashboard/status",
  isAuth,
  isAdminOrSupervisor,
  isCompliant,
  DashboardController.statusSummary
);

routes.get(
  "/dashboard/tickets",
  isAuth,
  isAdminOrSupervisor,
  isCompliant,
  DashboardController.ticketsStatistic
);

routes.get(
  "/dashboard/users",
  isAuth,
  isAdminOrSupervisor,
  isCompliant,
  DashboardController.usersReport
);

export default routes;
