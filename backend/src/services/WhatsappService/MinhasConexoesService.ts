import Queue from "../../models/Queue";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import {
  isConexaoPropriaEnabled,
  podeGerenciarConexao
} from "../../helpers/ConexaoPropria";

// Conexoes que a pessoa logada pode ver e religar na tela "Meu numero":
// vendedor = as das filas dele; gestor/admin = todas da empresa (regra em
// helpers/ConexaoPropria). Devolve so o necessario para a tela: nada de
// token, mensagens automaticas ou configuracao.

interface UsuarioLogado {
  id: string | number;
  profile: string;
  companyId: number;
}

export interface MinhaConexao {
  id: number;
  name: string;
  status: string;
  qrcode: string;
  pairedNumber: string | null;
  queues: { id: number; name: string }[];
  updatedAt: Date;
}

const filasDoUsuario = async (user: UsuarioLogado): Promise<number[]> => {
  const u = await User.findByPk(Number(user.id), {
    attributes: ["id"],
    include: [{ model: Queue, as: "queues", attributes: ["id"] }]
  });
  return (u?.queues || []).map(q => q.id);
};

const conexoesDaEmpresa = (companyId: number, id?: number) =>
  Whatsapp.findAll({
    attributes: ["id", "name", "status", "qrcode", "pairedNumber", "companyId", "channel", "updatedAt"],
    where: id ? { companyId, id } : { companyId },
    include: [{ model: Queue, as: "queues", attributes: ["id", "name"] }],
    order: [["name", "ASC"]]
  });

const permitidas = async (
  user: UsuarioLogado,
  id?: number
): Promise<Whatsapp[]> => {
  if (!isConexaoPropriaEnabled(user.companyId)) return [];
  const [filas, conexoes] = await Promise.all([
    filasDoUsuario(user),
    conexoesDaEmpresa(user.companyId, id)
  ]);
  // so WhatsApp (Baileys): Facebook/Instagram nao tem QR nem numero pareado
  return conexoes.filter(
    w =>
      (!w.channel || w.channel === "whatsapp") &&
      podeGerenciarConexao(
        user,
        { companyId: w.companyId, queueIds: (w.queues || []).map(q => q.id) },
        filas
      )
  );
};

export const paraTela = (w: Whatsapp): MinhaConexao => ({
  id: w.id,
  name: w.name,
  status: w.status,
  // o QR so interessa enquanto a conexao espera a leitura
  qrcode: w.status === "qrcode" ? w.qrcode || "" : "",
  pairedNumber: w.pairedNumber || null,
  queues: (w.queues || []).map(q => ({ id: q.id, name: q.name })),
  updatedAt: w.updatedAt
});

export const listarMinhasConexoes = async (
  user: UsuarioLogado
): Promise<MinhaConexao[]> => (await permitidas(user)).map(paraTela);

// Conexao que nao existe e conexao de outra pessoa respondem igual (404): a
// tela nunca confirma que o numero de um colega existe.
export const acharMinhaConexao = async (
  user: UsuarioLogado,
  whatsappId: number
): Promise<Whatsapp> => {
  if (!Number.isInteger(whatsappId) || whatsappId <= 0) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }
  const [conexao] = await permitidas(user, whatsappId);
  if (!conexao) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  return conexao;
};
