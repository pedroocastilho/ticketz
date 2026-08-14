import { Request, Response } from "express";
import AppError from "../errors/AppError";
import AutoReplyRule from "../models/AutoReplyRule";

const ensureAdmin = (req: Request): void => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

const parseBody = (body: any) => ({
  name: body.name,
  active: body.active !== false,
  whatsappId: body.whatsappId || null,
  queueId: body.queueId || null,
  keywords: body.keywords,
  delaySeconds:
    body.delaySeconds === undefined || body.delaySeconds === null
      ? 10
      : Number(body.delaySeconds),
  message: body.message
});

const validate = (data: ReturnType<typeof parseBody>): void => {
  if (!data.name?.trim()) {
    throw new AppError("ERR_AUTOREPLY_NAME_REQUIRED", 400);
  }
  if (!data.keywords?.trim()) {
    throw new AppError("ERR_AUTOREPLY_KEYWORDS_REQUIRED", 400);
  }
  if (!data.message?.trim()) {
    throw new AppError("ERR_AUTOREPLY_MESSAGE_REQUIRED", 400);
  }
  if (Number.isNaN(data.delaySeconds) || data.delaySeconds < 0) {
    throw new AppError("ERR_AUTOREPLY_INVALID_DELAY", 400);
  }
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const rules = await AutoReplyRule.findAll({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  return res.status(200).json(rules);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  ensureAdmin(req);
  const { companyId } = req.user;

  const data = parseBody(req.body);
  validate(data);

  const rule = await AutoReplyRule.create({ ...data, companyId } as any);

  return res.status(200).json(rule);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  ensureAdmin(req);
  const { companyId } = req.user;
  const { id } = req.params;

  const rule = await AutoReplyRule.findOne({ where: { id, companyId } });

  if (!rule) {
    throw new AppError("ERR_NO_AUTOREPLY_RULE_FOUND", 404);
  }

  const data = parseBody(req.body);
  validate(data);

  await rule.update(data);

  return res.status(200).json(rule);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  ensureAdmin(req);
  const { companyId } = req.user;
  const { id } = req.params;

  const rule = await AutoReplyRule.findOne({ where: { id, companyId } });

  if (!rule) {
    throw new AppError("ERR_NO_AUTOREPLY_RULE_FOUND", 404);
  }

  await rule.destroy();

  return res.status(200).json({ message: "Auto reply rule deleted" });
};
