// Tela de regras de resposta automatica.
//
// Customizacao da Diamond Global, usada apenas em portugues pela equipe de
// suporte: os textos estao no proprio componente em vez de irem para os
// arquivos de traducao, para manter o diff pequeno em relacao ao upstream.
import React, { useEffect, useState, useContext } from "react";

import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import FormControl from "@material-ui/core/FormControl";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import IconButton from "@material-ui/core/IconButton";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import Paper from "@material-ui/core/Paper";
import Select from "@material-ui/core/Select";
import Switch from "@material-ui/core/Switch";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import TextField from "@material-ui/core/TextField";
import { makeStyles } from "@material-ui/core/styles";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import useQueues from "../../hooks/useQueues";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles
  },
  field: {
    marginTop: 16,
    width: "100%"
  },
  hint: {
    marginTop: 4,
    fontSize: "0.8rem",
    opacity: 0.75
  }
}));

const emptyRule = {
  name: "",
  active: true,
  whatsappId: "",
  queueId: "",
  keywords: "",
  delaySeconds: 10,
  message: ""
};

const AutoReplyRules = () => {
  const classes = useStyles();
  const { whatsApps } = useContext(WhatsAppsContext);
  const { findAll: findAllQueues } = useQueues();

  const [rules, setRules] = useState([]);
  const [queues, setQueues] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(emptyRule);
  const [saving, setSaving] = useState(false);
  const [deletingRule, setDeletingRule] = useState(null);

  const loadRules = async () => {
    try {
      const { data } = await api.get("/auto-reply-rules");
      setRules(data);
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    loadRules();
    const loadQueues = async () => {
      try {
        setQueues(await findAllQueues());
      } catch (err) {
        toastError(err);
      }
    };
    loadQueues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenNew = () => {
    setEditing(emptyRule);
    setModalOpen(true);
  };

  const handleOpenEdit = rule => {
    setEditing({
      ...rule,
      whatsappId: rule.whatsappId || "",
      queueId: rule.queueId || ""
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...editing,
        whatsappId: editing.whatsappId || null,
        queueId: editing.queueId || null,
        delaySeconds: Number(editing.delaySeconds)
      };

      if (editing.id) {
        await api.put(`/auto-reply-rules/${editing.id}`, payload);
      } else {
        await api.post("/auto-reply-rules", payload);
      }

      setModalOpen(false);
      await loadRules();
    } catch (err) {
      toastError(err);
    }
    setSaving(false);
  };

  const handleDelete = async rule => {
    try {
      await api.delete(`/auto-reply-rules/${rule.id}`);
      await loadRules();
    } catch (err) {
      toastError(err);
    }
    setDeletingRule(null);
  };

  const connectionName = whatsappId => {
    if (!whatsappId) return "Todas";
    const found = (whatsApps || []).find(w => w.id === whatsappId);
    return found ? found.name : `#${whatsappId}`;
  };

  const queueName = queueId => {
    if (!queueId) return "Todas";
    const found = queues.find(q => q.id === queueId);
    return found ? found.name : `#${queueId}`;
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title="Excluir regra"
        open={Boolean(deletingRule)}
        onClose={() => setDeletingRule(null)}
        onConfirm={() => handleDelete(deletingRule)}
      >
        A regra "{deletingRule?.name}" será excluída. Conversas que já
        receberam a resposta não são afetadas.
      </ConfirmationModal>

      <MainHeader>
        <Title>Respostas automáticas</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="contained" color="primary" onClick={handleOpenNew}>
            Adicionar regra
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.mainPaper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell align="center">Ativa</TableCell>
              <TableCell align="center">Conexão</TableCell>
              <TableCell align="center">Fila</TableCell>
              <TableCell>Palavras</TableCell>
              <TableCell align="center">Espera</TableCell>
              <TableCell align="center">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map(rule => (
              <TableRow key={rule.id}>
                <TableCell>{rule.name}</TableCell>
                <TableCell align="center">
                  {rule.active ? "Sim" : "Não"}
                </TableCell>
                <TableCell align="center">
                  {connectionName(rule.whatsappId)}
                </TableCell>
                <TableCell align="center">{queueName(rule.queueId)}</TableCell>
                <TableCell>{rule.keywords}</TableCell>
                <TableCell align="center">{rule.delaySeconds}s</TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleOpenEdit(rule)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setDeletingRule(rule)}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        <DialogTitle>
          {editing.id ? "Editar regra" : "Nova regra"}
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            label="Nome da regra"
            variant="outlined"
            className={classes.field}
            value={editing.name}
            onChange={e => setEditing({ ...editing, name: e.target.value })}
          />

          <FormControlLabel
            control={
              <Switch
                checked={Boolean(editing.active)}
                onChange={e =>
                  setEditing({ ...editing, active: e.target.checked })
                }
                color="primary"
              />
            }
            label="Regra ativa"
          />

          <FormControl variant="outlined" className={classes.field}>
            <InputLabel>Conexão</InputLabel>
            <Select
              value={editing.whatsappId}
              label="Conexão"
              onChange={e =>
                setEditing({ ...editing, whatsappId: e.target.value })
              }
            >
              <MenuItem value="">
                <em>Todas as conexões</em>
              </MenuItem>
              {(whatsApps || []).map(whatsApp => (
                <MenuItem key={whatsApp.id} value={whatsApp.id}>
                  {whatsApp.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl variant="outlined" className={classes.field}>
            <InputLabel>Fila</InputLabel>
            <Select
              value={editing.queueId}
              label="Fila"
              onChange={e =>
                setEditing({ ...editing, queueId: e.target.value })
              }
            >
              <MenuItem value="">
                <em>Todas as filas</em>
              </MenuItem>
              {queues.map(queue => (
                <MenuItem key={queue.id} value={queue.id}>
                  {queue.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Palavras que disparam"
            variant="outlined"
            multiline
            minRows={2}
            className={classes.field}
            value={editing.keywords}
            onChange={e => setEditing({ ...editing, keywords: e.target.value })}
          />
          <div className={classes.hint}>
            Separe por vírgula. Maiúsculas e acentos são ignorados, mas erros de
            digitação não: cadastre as variações que aparecem de verdade, como
            "reembolso, reenbolso, estorno, dinheiro de volta".
          </div>

          <TextField
            label="Esperar antes de responder (segundos)"
            variant="outlined"
            type="number"
            className={classes.field}
            value={editing.delaySeconds}
            onChange={e =>
              setEditing({ ...editing, delaySeconds: e.target.value })
            }
          />

          <TextField
            label="Mensagem enviada"
            variant="outlined"
            multiline
            minRows={4}
            className={classes.field}
            value={editing.message}
            onChange={e => setEditing({ ...editing, message: e.target.value })}
          />
          <div className={classes.hint}>
            A resposta só é enviada se ninguém tiver assumido a conversa até lá,
            e no máximo uma vez por conversa.
          </div>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setModalOpen(false)}
            color="secondary"
            variant="outlined"
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            color="primary"
            variant="contained"
            disabled={saving}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default AutoReplyRules;
