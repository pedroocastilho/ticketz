import express from "express";

import isAuth from "../middleware/isAuth";
import * as CrmMetricasController from "../controllers/CrmMetricasController";
import * as CrmConversaController from "../controllers/CrmConversaController";

// Rotas usadas pelo CRM. Metricas (lidas pelo n8n) sem isAuth: a protecao e o
// token do CRM, conferido no controller. Conversa (botao "Chamar no WhatsApp"
// do CRM -> pagina /abrir/:numero): usuario logado.
const routes = express.Router();

routes.get(
  "/crm/metricas-atendimento",
  CrmMetricasController.metricasAtendimento
);

routes.get("/crm/conversa", isAuth, CrmConversaController.buscar);
routes.post("/crm/conversa", isAuth, CrmConversaController.abrirOuCriar);

export default routes;
