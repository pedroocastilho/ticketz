import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode.react";
import {
  Button,
  Chip,
  CircularProgress,
  Paper,
  Typography,
  makeStyles
} from "@material-ui/core";
import { toast } from "react-toastify";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

// Tela "Meu numero": o vendedor conecta, reconecta ou troca o proprio numero de
// WhatsApp sem chamar o admin; o gestor ve e religa o de todos. O backend so
// devolve as conexoes que a pessoa pode ver (/minhas-conexoes).
// Enquanto a tela esta aberta, confere a cada 3 s (o QR muda sozinho a cada
// ~20 s e o status muda quando o celular le o codigo).

const INTERVALO_MS = 3000;

const STATUS = {
  CONNECTED: { texto: "Conectado", cor: "#2e7d32" },
  qrcode: { texto: "Esperando a leitura do QR code", cor: "#ed6c02" },
  OPENING: { texto: "Conectando...", cor: "#0288d1" },
  PAIRING: { texto: "Conectando...", cor: "#0288d1" },
  PENDING: { texto: "Caiu: tentando reconectar", cor: "#ed6c02" },
  TIMEOUT: { texto: "Caiu: tentando reconectar", cor: "#ed6c02" },
  DISCONNECTED: { texto: "Desconectado", cor: "#d32f2f" },
  passkey_required: { texto: "Precisa do admin (passkey)", cor: "#d32f2f" }
};

const MENSAGENS = {
  ERR_CONEXAO_JA_CONECTADA: "Esse numero ja esta conectado. Para trocar, desconecte primeiro.",
  ERR_NO_WAPP_FOUND: "Conexao nao encontrada. Atualize a pagina."
};

const useStyles = makeStyles(theme => ({
  lista: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(2),
    padding: theme.spacing(1, 0)
  },
  cartao: {
    padding: theme.spacing(2),
    width: 380,
    maxWidth: "100%",
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1.5)
  },
  qr: {
    alignSelf: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 8
  },
  passos: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
    "& li": { marginBottom: 4 }
  },
  acoes: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(1)
  },
  vazio: {
    padding: theme.spacing(3),
    textAlign: "center"
  }
}));

// "5573999840461" -> "+55 73 99984-0461" (Brasil); outros paises so com +
const formatarNumero = numero => {
  const d = String(numero || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const corte = resto.length - 4;
    return `+55 ${ddd} ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  return `+${d}`;
};

const avisarErro = err => {
  const codigo = err?.response?.data?.error || err?.response?.data?.message;
  if (MENSAGENS[codigo]) toast.error(MENSAGENS[codigo]);
  else toastError(err);
};

const CartaoConexao = ({ conexao, ocupado, onAcao }) => {
  const classes = useStyles();
  const status = STATUS[conexao.status] || { texto: conexao.status, cor: "#757575" };
  const conectado = conexao.status === "CONNECTED";
  const esperandoQr = conexao.status === "qrcode" && conexao.qrcode;
  const conectando = ["OPENING", "PAIRING", "PENDING", "TIMEOUT"].includes(conexao.status);
  const desconectado = conexao.status === "DISCONNECTED";

  return (
    <Paper className={classes.cartao} variant="outlined">
      <Typography variant="h6">{conexao.name}</Typography>
      <div>
        <Chip
          size="small"
          label={status.texto}
          style={{ backgroundColor: status.cor, color: "#fff" }}
        />
      </div>
      <Typography variant="body2">
        Numero: <b>{formatarNumero(conexao.pairedNumber) || "ainda nao registrado"}</b>
      </Typography>

      {esperandoQr && (
        <>
          <div className={classes.qr}>
            <QRCode value={conexao.qrcode} size={240} />
          </div>
          <ol className={classes.passos}>
            <li>No celular do numero, abra o WhatsApp.</li>
            <li>Toque em <b>Mais opcoes</b> (ou <b>Configuracoes</b> no iPhone) e depois em <b>Aparelhos conectados</b>.</li>
            <li>Toque em <b>Conectar um aparelho</b> e aponte a camera para este codigo.</li>
          </ol>
          <Typography variant="caption" color="textSecondary">
            O codigo muda sozinho a cada poucos segundos. Se sumir, clique em "Gerar novo QR code".
          </Typography>
        </>
      )}

      {conexao.status === "qrcode" && !conexao.qrcode && (
        <Typography variant="body2">Gerando o QR code...</Typography>
      )}

      {conectando && (
        <Typography variant="body2" color="textSecondary">
          Aguarde alguns segundos. Se nao conectar em 1 minuto, use "Gerar novo QR code".
        </Typography>
      )}

      <div className={classes.acoes}>
        {desconectado && (
          <>
            <Button variant="contained" color="primary" disabled={ocupado} onClick={() => onAcao("novoQr", conexao)}>
              Conectar (QR code)
            </Button>
            <Button variant="outlined" disabled={ocupado} onClick={() => onAcao("reconectar", conexao)}>
              Tentar reconectar
            </Button>
          </>
        )}
        {(conexao.status === "qrcode" || conectando) && (
          <>
            <Button variant="outlined" color="primary" disabled={ocupado} onClick={() => onAcao("novoQr", conexao)}>
              Gerar novo QR code
            </Button>
            <Button variant="outlined" disabled={ocupado} onClick={() => onAcao("desconectar", conexao)}>
              Cancelar
            </Button>
          </>
        )}
        {conectado && (
          <Button variant="outlined" color="secondary" disabled={ocupado} onClick={() => onAcao("pedirDesconectar", conexao)}>
            Desconectar / trocar numero
          </Button>
        )}
        {ocupado && <CircularProgress size={24} />}
      </div>
    </Paper>
  );
};

const MeuNumero = () => {
  const classes = useStyles();
  const [conexoes, setConexoes] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const montado = useRef(true);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get("/minhas-conexoes");
      if (montado.current) setConexoes(data);
    } catch (err) {
      if (montado.current) setConexoes(atual => atual || []);
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    carregar();
    // so confere com a aba visivel: nao pesa no servidor com a tela esquecida aberta
    const timer = setInterval(() => {
      if (!document.hidden) carregar();
    }, INTERVALO_MS);
    return () => {
      montado.current = false;
      clearInterval(timer);
    };
  }, [carregar]);

  const executar = async (acao, conexao) => {
    if (acao === "pedirDesconectar") {
      setConfirmar(conexao);
      return;
    }
    const metodo = { reconectar: "post", novoQr: "put", desconectar: "delete" }[acao];
    setOcupado(conexao.id);
    try {
      await api[metodo](`/minhas-conexoes/${conexao.id}/sessao`);
      if (acao === "desconectar") toast.success("Numero desconectado.");
    } catch (err) {
      avisarErro(err);
    } finally {
      setOcupado(null);
      carregar();
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Meu numero de WhatsApp</Title>
      </MainHeader>
      <Typography variant="body2" color="textSecondary">
        Conecte, reconecte ou troque o numero que voce usa no atendimento. Quando o numero cair, volte aqui e clique em
        "Tentar reconectar"; se nao voltar, gere um QR code novo e leia com o celular.
      </Typography>

      {conexoes === null && (
        <div className={classes.vazio}><CircularProgress /></div>
      )}
      {conexoes && conexoes.length === 0 && (
        <Paper className={classes.vazio} variant="outlined">
          <Typography>Nenhum numero ligado a voce ainda. Fale com o gestor para criar a sua conexao.</Typography>
        </Paper>
      )}
      {conexoes && conexoes.length > 0 && (
        <div className={classes.lista}>
          {conexoes.map(c => (
            <CartaoConexao key={c.id} conexao={c} ocupado={ocupado === c.id} onAcao={executar} />
          ))}
        </div>
      )}

      <ConfirmationModal
        title="Desconectar este numero?"
        open={!!confirmar}
        onClose={() => setConfirmar(null)}
        onConfirm={() => {
          const c = confirmar;
          setConfirmar(null);
          if (c) executar("desconectar", c);
        }}
      >
        O numero {formatarNumero(confirmar?.pairedNumber)} sai do atendimento e deixa de receber mensagens aqui ate
        alguem conectar de novo. Para trocar de numero: desconecte, clique em "Conectar (QR code)" e leia o codigo com o
        celular do numero novo. A gestao e avisada quando o numero muda.
      </ConfirmationModal>
    </MainContainer>
  );
};

export default MeuNumero;
