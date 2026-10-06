import Queue from "../models/Queue";
import Company from "../models/Company";
import User from "../models/User";
import Setting from "../models/Setting";
import { isReadonlySupervisor } from "./ReadonlySupervisor";

interface SerializedUser {
  id: number;
  name: string;
  email: string;
  profile: string;
  companyId: number;
  company: Company | null;
  super: boolean;
  queues: Queue[];
  // supervisor so de leitura (SUPERVISOR_READONLY_COMPANIES): a tela esconde
  // os botoes de agir; quem garante de verdade e o backend (isAuth)
  readonlySupervisor: boolean;
}

export const SerializeUser = async (user: User): Promise<SerializedUser> => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profile: user.profile,
    companyId: user.companyId,
    company: user.company,
    super: user.super,
    queues: user.queues,
    readonlySupervisor: isReadonlySupervisor({
      profile: user.profile,
      companyId: user.companyId
    })
  };
};
