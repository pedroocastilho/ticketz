import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import User from "../models/User";

/**
 * Libera a rota para admin e para o perfil supervisor. Criado para o
 * dashboard: quem supervisiona precisa acompanhar abertos, resolvidos e tempo
 * medio dos atendentes sem receber os demais poderes de admin.
 */
const isAdminOrSupervisor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const { profile } = await User.findByPk(req.user.id);
  if (profile !== "admin" && profile !== "supervisor") {
    throw new AppError("Acesso não permitido", 403);
  }

  return next();
};

export default isAdminOrSupervisor;
