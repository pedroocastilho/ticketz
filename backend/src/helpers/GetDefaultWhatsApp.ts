import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";

const GetDefaultWhatsApp = async (companyId: number): Promise<Whatsapp> => {
  let defaultWhatsapp = await Whatsapp.findOne({
    where: {
      isDefault: true,
      companyId,
      channel: "whatsapp",
      status: "CONNECTED"
    }
  });

  if (!defaultWhatsapp) {
    defaultWhatsapp = await Whatsapp.findOne({
      where: {
        companyId,
        channel: "whatsapp",
        status: "CONNECTED"
      }
    });
    // registra qual numero foi escolhido: sem isso ninguem descobre por que
    // uma mensagem saiu de outro numero
    logger.warn(
      { companyId, whatsapp: defaultWhatsapp?.name },
      "No default WhatsApp found, falling back to any connected WhatsApp"
    );
  }

  if (!defaultWhatsapp) {
    throw new AppError("ERR_NO_DEF_WAPP_FOUND");
  }

  return defaultWhatsapp;
};

export default GetDefaultWhatsApp;
