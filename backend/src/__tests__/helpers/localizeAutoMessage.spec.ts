import {
  detectLanguage,
  pickLanguageVariant,
  getTodayOutOfHoursMessage
} from "../../helpers/localizeAutoMessage";
import { OpenHoursData } from "../../helpers/checkOpenHours";

describe("detectLanguage", () => {
  it("detecta espanhol em mensagens tipicas de cliente", () => {
    expect(detectLanguage("Hola, necesito ayuda con mi acceso al curso")).toBe(
      "es"
    );
    expect(detectLanguage("¿Cómo puedo entrar a las clases?")).toBe("es");
    expect(detectLanguage("Buenos días, no tengo la contraseña")).toBe("es");
  });

  it("detecta portugues em mensagens tipicas de cliente", () => {
    expect(detectLanguage("Olá, preciso de ajuda com meu acesso")).toBe("pt");
    expect(detectLanguage("Bom dia, não consigo entrar nas aulas")).toBe("pt");
    expect(detectLanguage("comprei o curso e ainda não recebi o e-mail")).toBe(
      "pt"
    );
  });

  it("na duvida (vazio ou neutro) fica em portugues", () => {
    expect(detectLanguage("")).toBe("pt");
    expect(detectLanguage("ok")).toBe("pt");
    expect(detectLanguage("teste@email.com")).toBe("pt");
  });
});

describe("pickLanguageVariant", () => {
  const both = ["Olá, tudo bem?", "[es]", "¡Hola! ¿Qué tal?"].join("\n");

  it("devolve a variante do idioma pedido", () => {
    expect(pickLanguageVariant(both, "pt")).toBe("Olá, tudo bem?");
    expect(pickLanguageVariant(both, "es")).toBe("¡Hola! ¿Qué tal?");
  });

  it("aceita marcador [pt] explicito e caixa alta", () => {
    const text = ["[PT]", "oi", "[ES]", "hola"].join("\n");
    expect(pickLanguageVariant(text, "pt")).toBe("oi");
    expect(pickLanguageVariant(text, "es")).toBe("hola");
  });

  it("sem marcador devolve o texto inteiro (compatibilidade)", () => {
    const text = "mensagem unica\ncom duas linhas";
    expect(pickLanguageVariant(text, "es")).toBe(text);
  });

  it("cai no portugues quando falta a variante pedida", () => {
    const soPt = ["so portugues", "[pt]", "ainda portugues"].join("\n");
    expect(pickLanguageVariant(soPt, "es")).toContain("portugues");
  });

  it("preserva linhas em branco internas da variante", () => {
    const text = ["linha 1", "", "linha 2", "[es]", "línea 1"].join("\n");
    expect(pickLanguageVariant(text, "pt")).toBe("linha 1\n\nlinha 2");
  });
});

describe("getTodayOutOfHoursMessage", () => {
  const allDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  it("devolve a mensagem da regra que cobre o dia de hoje", () => {
    const schedules = {
      timezone: "America/Sao_Paulo",
      overrides: [],
      weeklyRules: [
        {
          days: allDays,
          hours: [{ from: "08:00", to: "18:00" }],
          message: "mensagem do dia"
        }
      ]
    } as unknown as OpenHoursData;
    expect(getTodayOutOfHoursMessage(schedules)).toBe("mensagem do dia");
  });

  it("devolve null quando a regra do dia nao tem mensagem propria", () => {
    const schedules = {
      timezone: "America/Sao_Paulo",
      overrides: [],
      weeklyRules: [
        { days: allDays, hours: [{ from: "08:00", to: "18:00" }] }
      ]
    } as OpenHoursData;
    expect(getTodayOutOfHoursMessage(schedules)).toBeNull();
  });

  it("devolve null para horarios em formato legado ou ausentes", () => {
    expect(getTodayOutOfHoursMessage(null)).toBeNull();
    expect(getTodayOutOfHoursMessage(undefined)).toBeNull();
    expect(
      getTodayOutOfHoursMessage([] as unknown as OpenHoursData)
    ).toBeNull();
  });
});
