import express from "express";

import isAuth from "../middleware/isAuth";
import * as CrmMetricasController from "../controllers/CrmMetricasController";
import * as CrmConversaController from "../controllers/CrmConversaController";
import * as CrmConversasController from "../controllers/CrmConversasController";
import * as CrmIaController from "../controllers/CrmIaController";
import * as CrmEtiquetaController from "../controllers/CrmEtiquetaController";

// Rotas usadas pelo CRM. Metricas (lidas pelo n8n) e conversas (lidas pelo
// cerebro dos Diamond Agentes) sem isAuth: a protecao e o token do CRM,
// conferido no controller. Conversa (botao "Chamar no WhatsApp"
// do CRM -> pagina /abrir/:numero): usuario logado.
const routes = express.Router();

routes.get(
  "/crm/metricas-atendimento",
  CrmMetricasController.metricasAtendimento
);
// as mesmas metricas so de uma lista de numeros (painel do Formulario Jessica)
routes.post(
  "/crm/metricas-atendimento",
  CrmMetricasController.metricasAtendimentoPorNumeros
);

routes.get(
  "/crm/conversas-com-atividade",
  CrmConversasController.conversasComAtividade
);
routes.get("/crm/conversa-historico", CrmConversasController.conversaHistorico);
// cartao mudou de coluna no CRM -> etiqueta de etapa da conversa (mesmo token)
routes.post("/crm/etiqueta-etapa", CrmEtiquetaController.etiquetaEtapa);
// nota da Inteligencia Comercial gravada no contato (mesma protecao por token)
routes.post("/crm/ia-contato", CrmIaController.gravarIaContato);

routes.get("/crm/conversa", isAuth, CrmConversaController.buscar);
routes.post("/crm/conversa", isAuth, CrmConversaController.abrirOuCriar);

export default routes;
