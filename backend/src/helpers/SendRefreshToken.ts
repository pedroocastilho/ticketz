import { CookieOptions, Response } from "express";

// Opcoes do cookie de renovacao do login (jrt). Diamond: o Ticketz roda dentro do
// CRM (iframe em diamond.magnuscrm.com.br, outro site). Ali o navegador trata o
// cookie como de terceiros e, com bloqueio de terceiros (Chrome/Edge com o
// bloqueio ligado, Safari, Brave, aba anonima), nao guarda nem manda o cookie: o
// login caia a cada recarga ou a cada 15 min. "Partitioned" (CHIPS) e aceito
// mesmo com o bloqueio: o cookie fica guardado so para o Ticketz dentro do CRM.
export const refreshTokenCookieOptions = (): CookieOptions => {
  const cookieOptions: CookieOptions = { httpOnly: true };

  if (process.env.BACKEND_URL?.startsWith("https:")) {
    cookieOptions.sameSite = "none";
    cookieOptions.secure = true;
    cookieOptions.partitioned = true;
  }

  return cookieOptions;
};

export const SendRefreshToken = (res: Response, token: string): void => {
  res.cookie("jrt", token, {
    ...refreshTokenCookieOptions(),
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
};

// apagar precisa das mesmas opcoes (o cookie particionado so sai com
// partitioned); apaga tambem o antigo, sem particao, gravado antes desta versao
export const ClearRefreshToken = (res: Response): void => {
  const options = refreshTokenCookieOptions();
  res.clearCookie("jrt", options);
  if (options.partitioned) {
    res.clearCookie("jrt", { ...options, partitioned: false });
  }
};
