import {
  ClearRefreshToken,
  SendRefreshToken
} from "../../helpers/SendRefreshToken";

// cookie de renovacao do login: particionado em https (Ticketz dentro do CRM)
const respostaFalsa = () => {
  const chamadas: { tipo: string; nome: string; opcoes: any }[] = [];
  const res: any = {
    cookie: (nome: string, _valor: string, opcoes: any) =>
      chamadas.push({ tipo: "cookie", nome, opcoes }),
    clearCookie: (nome: string, opcoes: any) =>
      chamadas.push({ tipo: "clear", nome, opcoes })
  };
  return { res, chamadas };
};

describe("SendRefreshToken", () => {
  const original = process.env.BACKEND_URL;
  afterEach(() => {
    process.env.BACKEND_URL = original;
  });

  it("em https grava o jrt particionado, SameSite=None e Secure, valendo 7 dias", () => {
    process.env.BACKEND_URL = "https://atendimento.diamondglobal.com.br";
    const { res, chamadas } = respostaFalsa();
    SendRefreshToken(res, "tok");
    const { opcoes } = chamadas[0];
    expect(opcoes).toMatchObject({
      httpOnly: true,
      sameSite: "none",
      secure: true,
      partitioned: true
    });
    const dias = (opcoes.expires.getTime() - Date.now()) / 86400000;
    expect(Math.round(dias)).toBe(7);
  });

  it("em http (desenvolvimento) nao particiona", () => {
    process.env.BACKEND_URL = "http://localhost:8080";
    const { res, chamadas } = respostaFalsa();
    SendRefreshToken(res, "tok");
    expect(chamadas[0].opcoes.partitioned).toBeUndefined();
  });

  it("ao sair apaga o particionado e o antigo sem particao", () => {
    process.env.BACKEND_URL = "https://atendimento.diamondglobal.com.br";
    const { res, chamadas } = respostaFalsa();
    ClearRefreshToken(res);
    expect(chamadas.map(c => c.opcoes.partitioned)).toEqual([true, false]);
    expect(chamadas.every(c => c.nome === "jrt" && c.tipo === "clear")).toBe(
      true
    );
  });
});
