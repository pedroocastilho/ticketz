import React from "react";

import Paper from "@material-ui/core/Paper";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableContainer from "@material-ui/core/TableContainer";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import { green, red } from "@material-ui/core/colors";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import ErrorIcon from "@material-ui/icons/Error";

import { formatTimeInterval } from "../../helpers/formatTimeInterval.js";
import { OCULTO, OlhoNumeros } from "./TableAttendantsStatus";

// Quadro da gestao no painel do comercial (2026-10-29): gestora nao atende
// lead, entao nao entra na tabela dos vendedores; aqui mostra so quanto tempo
// ela fica conectada por dia, em media, no periodo escolhido.
const useStyles = makeStyles(theme => ({
  titulo: {
    padding: theme.spacing(2, 2, 0)
  },
  on: { color: green[600], fontSize: "20px" },
  off: { color: red[600], fontSize: "20px" },
  oculto: { color: theme.palette.text.disabled, letterSpacing: 2 }
}));

export default function GestoresPainel({ gestores, ocultos = [], onAlternar }) {
  const classes = useStyles();
  if (!gestores?.length) return null;
  return (
    <TableContainer component={Paper}>
      <Typography className={classes.titulo} component="h3" variant="h6">
        Gestão
      </Typography>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>Nome</TableCell>
            <TableCell align="center">Tempo médio conectada por dia</TableCell>
            <TableCell align="center">Dias com conexão no período</TableCell>
            <TableCell align="center">Agora</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {gestores.map(g => {
            const oculto = ocultos.includes(g.id);
            const numero = valor =>
              oculto ? <span className={classes.oculto}>{OCULTO}</span> : valor;
            return (
              <TableRow key={g.id}>
                <TableCell padding="checkbox">
                  <OlhoNumeros
                    oculto={oculto}
                    onClick={() => onAlternar(g.id)}
                  />
                </TableCell>
                <TableCell>{g.name}</TableCell>
                <TableCell align="center">
                  {numero(
                    g.mediaConectadaSeg
                      ? formatTimeInterval(g.mediaConectadaSeg)
                      : "—"
                  )}
                </TableCell>
                <TableCell align="center">{numero(g.diasConectada)}</TableCell>
                <TableCell align="center">
                  {g.online ? (
                    <CheckCircleIcon className={classes.on} />
                  ) : (
                    <ErrorIcon className={classes.off} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
