import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { getWbot, removeWbot } from "../libs/wbot";
import User from "../models/User";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import { registrarPedidoConexao } from "../services/WbotServices/RegistrarNumeroPareado";
import {
  acharMinhaConexao,
  listarMinhasConexoes
} from "../services/WhatsappService/MinhasConexoesService";
import { logger } from "../utils/logger";

// Tela "Meu numero": o vendedor (ou o gestor) religa o proprio numero sem
// depender do admin. Permissao em MinhasConexoesService (404 para conexao que
// a pessoa nao pode ver).
//   GET    /minhas-conexoes             lista
//   POST   /minhas-conexoes/:id/sessao  tenta reconectar com a sessao atual
//   PUT    /minhas-conexoes/:id/sessao  sessao limpa = QR novo (ler com o celular)
//   DELETE /minhas-conexoes/:id/sessao  desconecta (para trocar de numero)

const usuario = (req: Request) => ({
  id: req.user.id,
  profile: req.user.profile,
  companyId: req.user.companyId
});

// guarda quem pediu: vai no aviso ao CRM se a conexao voltar com outro numero
const anotarPedido = async (req: Request, whatsappId: number) => {
  const u = await User.findByPk(Number(req.user.id), { attributes: ["id", "name"] });
  if (u) registrarPedidoConexao(whatsappId, { id: u.id, name: u.name });
};

// a permissao usa uma consulta enxuta; para mexer na sessao carrega a conexao
// completa, como faz a tela Conexoes do admin
const conexaoCompleta = async (req: Request) => {
  const permitida = await acharMinhaConexao(usuario(req), Number(req.params.whatsappId));
  return ShowWhatsAppService(permitida.id);
};

export const index = async (req: Request, res: Response): Promise<Response> =>
  res.status(200).json(await listarMinhasConexoes(usuario(req)));

export const reconectar = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const conexao = await conexaoCompleta(req);
  // so religa o que esta parado: conectando/caido o proprio wbot ja esta
  // tentando, e uma segunda sessao em paralelo derruba as duas
  if (conexao.status !== "DISCONNECTED") return res.status(200).json({ ok: true });
  await anotarPedido(req, conexao.id);
  await StartWhatsAppSession(conexao, conexao.companyId);
  return res.status(200).json({ ok: true });
};

export const novoQr = async (req: Request, res: Response): Promise<Response> => {
  const conexao = await conexaoCompleta(req);
  // conectado: QR novo derrubaria o numero que esta funcionando; desconectar antes
  if (conexao.status === "CONNECTED") {
    throw new AppError("ERR_CONEXAO_JA_CONECTADA", 409);
  }
  await anotarPedido(req, conexao.id);
  // fecha a sessao que estiver esperando leitura (sem logout) antes da nova
  await removeWbot(conexao.id, false);
  await conexao.update({ session: "", qrcode: "", retries: 0 });
  await StartWhatsAppSession(conexao, conexao.companyId);
  return res.status(200).json({ ok: true });
};

export const desconectar = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const conexao = await conexaoCompleta(req);
  let sessao = null;
  try {
    sessao = getWbot(conexao.id);
  } catch (err) {
    sessao = null;
  }
  if (sessao) {
    // mesmo caminho do botao Desconectar do admin: o wbot trata o logout
    try {
      await sessao.logout();
    } catch (err) {
      logger.warn({ message: err?.message, whatsappId: conexao.id }, "Meu numero: logout falhou, fechando a sessao");
    }
    try {
      sessao.ws.close();
    } catch (err) {
      // ja fechada
    }
  } else {
    // sem sessao viva (caiu, ou parou no meio do QR): so marca desconectado
    await conexao.update({ status: "DISCONNECTED", qrcode: "", session: "" });
  }
  logger.info({ whatsappId: conexao.id, userId: req.user.id }, "Meu numero: conexao desconectada pela tela");
  return res.status(200).json({ ok: true });
};
