import express from "express";

import * as CrmMetricasController from "../controllers/CrmMetricasController";

// Rotas lidas pelo CRM (n8n). Sem isAuth: a protecao e o token do CRM,
// conferido no controller.
const routes = express.Router();

routes.get(
  "/crm/metricas-atendimento",
  CrmMetricasController.metricasAtendimento
);

export default routes;
