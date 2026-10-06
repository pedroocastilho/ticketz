import {
  isAllowedForReadonly,
  isReadonlySupervisor,
  readonlyCompanies
} from "../../helpers/ReadonlySupervisor";

const env = { SUPERVISOR_READONLY_COMPANIES: "2, 7" };

describe("readonlyCompanies", () => {
  it("le a lista e ignora lixo", () => {
    expect(readonlyCompanies(env)).toEqual([2, 7]);
    expect(
      readonlyCompanies({ SUPERVISOR_READONLY_COMPANIES: "a, ,3" })
    ).toEqual([3]);
    expect(readonlyCompanies({})).toEqual([]);
  });
});

describe("isReadonlySupervisor", () => {
  it("so supervisor de empresa listada", () => {
    expect(
      isReadonlySupervisor({ profile: "supervisor", companyId: 2 }, env)
    ).toBe(true);
    expect(
      isReadonlySupervisor({ profile: "supervisor", companyId: 1 }, env)
    ).toBe(false);
    expect(isReadonlySupervisor({ profile: "admin", companyId: 2 }, env)).toBe(
      false
    );
    expect(isReadonlySupervisor({ profile: "user", companyId: 2 }, env)).toBe(
      false
    );
    expect(
      isReadonlySupervisor({ profile: "supervisor", companyId: 2 }, {})
    ).toBe(false);
    expect(isReadonlySupervisor(undefined, env)).toBe(false);
  });
});

describe("isAllowedForReadonly", () => {
  it("consultas passam", () => {
    expect(isAllowedForReadonly("GET", "/tickets?showAll=true", 5)).toBe(true);
    expect(isAllowedForReadonly("GET", "/messages/10?markAsRead=true", 5)).toBe(
      true
    );
  });

  it("responder, aceitar, transferir, encerrar, abrir conversa e apagar sao recusados", () => {
    expect(isAllowedForReadonly("POST", "/messages/10", 5)).toBe(false);
    expect(isAllowedForReadonly("PUT", "/tickets/10", 5)).toBe(false);
    expect(isAllowedForReadonly("POST", "/tickets", 5)).toBe(false);
    expect(isAllowedForReadonly("DELETE", "/tickets/10", 5)).toBe(false);
    expect(isAllowedForReadonly("POST", "/backend/messages/10", 5)).toBe(false);
    expect(isAllowedForReadonly("PUT", "/users/6", 5)).toBe(false);
  });

  it("sessao e o proprio cadastro continuam liberados", () => {
    expect(isAllowedForReadonly("DELETE", "/auth/logout", 5)).toBe(true);
    expect(isAllowedForReadonly("POST", "/backend/auth/refresh_token", 5)).toBe(
      true
    );
    expect(isAllowedForReadonly("PUT", "/users/5", 5)).toBe(true);
    expect(isAllowedForReadonly("PUT", "/users/5/", "5")).toBe(true);
  });
});
