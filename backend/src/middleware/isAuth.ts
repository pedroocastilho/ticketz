import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import {
  isAllowedForReadonly,
  isReadonlySupervisor
} from "../helpers/ReadonlySupervisor";

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  super: boolean;
  companyId: number;
  iat: number;
  exp: number;
}

const isAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (req?.user) {
    // previous middleware already authorized
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("ERR_UNAUTHORIZED", 401, "debug");
  }

  const [, token] = authHeader.split(" ");

  try {
    const tokenData = verify(token, authConfig.secret) as TokenPayload;
    req.user = {
      id: tokenData.id,
      profile: tokenData.profile,
      isSuper: tokenData.super,
      companyId: tokenData.companyId
    };
    req.companyId = tokenData.companyId;
  } catch (err) {
    throw new AppError("ERR_SESSION_EXPIRED", 403, "debug");
  }

  // supervisor somente leitura (empresas em SUPERVISOR_READONLY_COMPANIES):
  // qualquer acao que altera algo e recusada aqui, num ponto so, em vez de
  // depender de cada rota lembrar de checar
  if (
    isReadonlySupervisor(req.user) &&
    !isAllowedForReadonly(req.method, req.originalUrl, req.user.id)
  ) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  return next();
};

export default isAuth;
