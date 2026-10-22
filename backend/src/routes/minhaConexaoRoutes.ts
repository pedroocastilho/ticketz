import express from "express";

import isAuth from "../middleware/isAuth";
import * as MinhaConexaoController from "../controllers/MinhaConexaoController";

// Tela "Meu numero" (empresas em CONEXAO_PROPRIA_COMPANIES): cada um religa o
// proprio numero. Usuario logado; quem pode o que fica no servico.
const routes = express.Router();

routes.get("/minhas-conexoes", isAuth, MinhaConexaoController.index);
routes.post("/minhas-conexoes/:whatsappId/sessao", isAuth, MinhaConexaoController.reconectar);
routes.put("/minhas-conexoes/:whatsappId/sessao", isAuth, MinhaConexaoController.novoQr);
routes.delete("/minhas-conexoes/:whatsappId/sessao", isAuth, MinhaConexaoController.desconectar);

export default routes;
