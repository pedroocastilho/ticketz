import React, { useContext, useEffect, useRef, useState } from "react";
import { useHistory, useLocation, useParams } from "react-router-dom";
import { Button, CircularProgress, Paper, Typography } from "@material-ui/core";

import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";

// Pagina do botao "Chamar no WhatsApp" do CRM: /abrir/<numero com DDI>?nome=Fulano
// Atendente: acha ou cria a conversa com a pessoa no numero dele e abre.
// Admin e supervisor: abrem a conversa que ja existe (so leitura para o supervisor).

const MENSAGENS = {
  ERR_CRM_SEM_CONVERSA: "Ainda nao existe conversa com esse numero.",
  ERR_CRM_NUMERO_INVALIDO: "O numero do link nao e valido.",
  ERR_CRM_SEM_FILA: "Seu usuario nao tem fila: fale com o gestor.",
  ERR_CHECK_NUMBER: "Esse numero nao tem WhatsApp.",
  ERR_WAPP_NOT_CONNECTED: "O seu numero de WhatsApp esta desconectado: fale com o gestor para conectar.",
  ERR_NO_WAPP_FOUND: "Nao achei o seu numero de WhatsApp: fale com o gestor.",
  ERR_NO_DEF_WAPP_FOUND: "Nao achei o seu numero de WhatsApp: fale com o gestor."
};

const AbrirConversa = () => {
  const { numero } = useParams();
  const location = useLocation();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [erro, setErro] = useState(null);
  const jaPediu = useRef(false);

  useEffect(() => {
    // espera o usuario carregar (perfil decide se cria ou so abre); pede uma vez so
    if (!user?.id || jaPediu.current) return;
    jaPediu.current = true;
    const nome = new URLSearchParams(location.search).get("nome") || "";
    const pedido =
      user.profile === "user"
        ? api.post("/crm/conversa", { numero, nome })
        : api.get("/crm/conversa", { params: { numero, nome } });
    pedido
      .then(({ data }) => history.replace(`/tickets/${data.uuid}`))
      .catch(err => {
        const codigo = err?.response?.data?.error || err?.response?.data?.message;
        setErro(MENSAGENS[codigo] || `Nao consegui abrir a conversa (${codigo || "erro"}).`);
      });
  }, [user, numero, location.search, history]);

  return (
    <Paper style={{ margin: 24, padding: 32, textAlign: "center" }}>
      {!erro ? (
        <>
          <CircularProgress />
          <Typography style={{ marginTop: 16 }}>Abrindo a conversa com +{numero}...</Typography>
        </>
      ) : (
        <>
          <Typography variant="h6">{erro}</Typography>
          <Button
            style={{ marginTop: 16 }}
            variant="contained"
            color="primary"
            onClick={() => history.replace("/tickets")}
          >
            Ir para as conversas
          </Button>
        </>
      )}
    </Paper>
  );
};

export default AbrirConversa;
