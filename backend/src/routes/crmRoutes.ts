import express from "express";

import isAuth from "../middleware/isAuth";
import * as CrmMetricasController from "../controllers/CrmMetricasController";
import * as CrmConversaController from "../controllers/CrmConversaController";
import * as CrmConversasController from "../controllers/CrmConversasController";
import * as CrmIaController from "../controllers/CrmIaController";
import * as CrmEtiquetaController from "../controllers/CrmEtiquetaController";
import * as CrmDonoController from "../controllers/CrmDonoController";

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
// etiqueta no contato, ex. "Comprou na live" (mesmo token)
routes.post("/crm/etiqueta-contato", CrmEtiquetaController.etiquetaContato);
// lead com dono chamou o numero de outro vendedor: a conversa vai para o dono (mesmo token)
routes.post("/crm/conversa-para-dono", CrmDonoController.conversaParaDono);
// conexoes com status e numero pareado: rodizio do link e divisao de leads (mesmo token)
routes.get("/crm/numeros", CrmDonoController.numeros);
// nota da Inteligencia Comercial gravada no contato (mesma protecao por token)
routes.post("/crm/ia-contato", CrmIaController.gravarIaContato);

routes.get("/crm/conversa", isAuth, CrmConversaController.buscar);
routes.post("/crm/conversa", isAuth, CrmConversaController.abrirOuCriar);

export default routes;
