import React, { useContext } from "react";
import { Route as RouterRoute, Redirect } from "react-router-dom";

import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";

const Route = ({ component: Component, isPrivate = false, ...rest }) => {
  const { isAuth, loading } = useContext(AuthContext);

  if (!isAuth && isPrivate) {
    // sessao ainda sendo restaurada (refresh_token): espera em vez de mandar
    // para o login, senao o link aberto (ex.: /abrir/... do CRM) se perde
    if (loading) {
      return <BackdropLoading />;
    }
    // guarda para onde a pessoa ia: depois do login ela volta para la
    try {
      const destino = `${rest.location?.pathname || ""}${rest.location?.search || ""}`;
      if (destino && destino !== "/" && destino !== "/login") {
        sessionStorage.setItem("destinoAposLogin", destino);
      }
    } catch (e) {
      // sem sessionStorage (modo restrito): segue sem voltar ao link
    }
    return (
      <>
        {loading && <BackdropLoading />}
        <Redirect to={{ pathname: "/login", state: { from: rest.location } }} />
      </>
    );
  }

  if (isAuth && !isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Redirect to={{ pathname: "/", state: { from: rest.location } }} />;
      </>
    );
  }

  return (
    <>
      {loading && <BackdropLoading />}
      <RouterRoute {...rest} component={Component} />
    </>
  );
};

export default Route;
