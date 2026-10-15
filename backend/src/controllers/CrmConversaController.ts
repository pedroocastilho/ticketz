import { Request, Response } from "express";
import AbrirConversaCrmService from "../services/CrmServices/AbrirConversaCrmService";

// Botao "Chamar no WhatsApp" do CRM -> pagina /abrir/:numero do Ticketz.
//   GET  /crm/conversa?numero=&nome=  so acha a conversa que ja existe
//        (admin e supervisor somente leitura usam esta)
//   POST /crm/conversa {numero, nome}  acha ou cria, no numero do atendente
// Responde { uuid, criada }; a tela navega para /tickets/<uuid>.

const abrir = async (req: Request, res: Response, criar: boolean) => {
  const origem = (criar ? req.body : req.query) || {};
  const resultado = await AbrirConversaCrmService({
    userId: Number(req.user.id),
    companyId: req.user.companyId,
    numero: String(origem.numero || ""),
    nome: origem.nome ? String(origem.nome) : undefined,
    criar
  });
  return res.status(200).json(resultado);
};

export const buscar = async (req: Request, res: Response): Promise<Response> =>
  abrir(req, res, false);

export const abrirOuCriar = async (
  req: Request,
  res: Response
): Promise<Response> => abrir(req, res, true);
