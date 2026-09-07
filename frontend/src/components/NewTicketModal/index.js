import React, { useState, useEffect, useContext } from "react";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import ButtonWithSpinner from "../ButtonWithSpinner";
import ContactModal from "../ContactModal";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import {
  Grid,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  FormControl,
  InputLabel
} from "@material-ui/core";
import { toast } from "react-toastify";
import { ContactSelect } from "../ContactSelect";

const NewTicketModal = ({ modalOpen, onClose, contact }) => {
  const [selectedContact, setSelectedContact] = useState(null);
  const [forcedContact, setForcedContact] = useState(null);
  const [selectedQueue, setSelectedQueue] = useState("");
  const [newContact, setNewContact] = useState({});
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // conexao (numero) pela qual a conversa vai sair: antes o backend usava
  // sempre a padrao da empresa e a mensagem saia do numero de outro atendente
  const [selectedWhatsappId, setSelectedWhatsappId] = useState("");
  const { user } = useContext(AuthContext);
  const { whatsApps } = useContext(WhatsAppsContext);

  const connectedWhatsApps = (whatsApps || []).filter(
    whatsApp =>
      whatsApp.status === "CONNECTED" &&
      (!whatsApp.channel || whatsApp.channel === "whatsapp")
  );

  // sugere a conexao ligada a fila escolhida (ou as filas do atendente);
  // entre varias, prefere a padrao
  const suggestWhatsapp = queueId => {
    const queueIds = queueId
      ? [queueId]
      : (user.queues || []).map(queue => queue.id);
    const linked = connectedWhatsApps.filter(whatsApp =>
      (whatsApp.queues || []).some(queue => queueIds.includes(queue.id))
    );
    const candidates = linked.length > 0 ? linked : connectedWhatsApps;
    if (candidates.length === 0) return "";
    if (candidates.length === 1) return candidates[0].id;
    // mais de um numero possivel: so sugere se um deles for o padrao,
    // senao deixa vazio para o atendente escolher de proposito
    const defaultOne = candidates.find(whatsApp => whatsApp.isDefault);
    return defaultOne ? defaultOne.id : "";
  };

  useEffect(() => {
    if (contact) {
      setForcedContact(contact);
      setSelectedContact(contact);
    }
  }, [contact]);

  useEffect(() => {
    setSelectedQueue("");
    setSelectedWhatsappId("");
  }, [modalOpen]);

  // preenche a sugestao assim que o modal abre ou as conexoes carregam,
  // sem sobrescrever uma escolha manual do atendente
  useEffect(() => {
    if (!modalOpen || selectedWhatsappId) return;
    const suggested = suggestWhatsapp(selectedQueue);
    if (suggested) setSelectedWhatsappId(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, whatsApps, selectedQueue]);

  const handleClose = () => {
    onClose();
    setSelectedContact(null);
  };

  const handleSaveTicket = async contactId => {
    if (!contactId) return;
    if (selectedQueue === "" && user.profile !== "admin") {
      toast.error("Selecione uma fila");
      return;
    }
    if (connectedWhatsApps.length > 1 && !selectedWhatsappId) {
      toast.error(i18n.t("newTicketModal.selectConnection"));
      return;
    }
    setLoading(true);
    try {
      const queueId = selectedQueue !== "" ? selectedQueue : null;
      const whatsappId =
        selectedWhatsappId ||
        (connectedWhatsApps.length === 1 ? connectedWhatsApps[0].id : null);
      const { data: ticket } = await api.post("/tickets", {
        contactId: contactId,
        queueId,
        userId: user.id,
        whatsappId,
        status: "open"
      });
      onClose(ticket);
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  const handleSelectedContact = contactId => {
    if (contactId) {
      setSelectedContact({ id: contactId });
    } else {
      setSelectedContact(null);
    }
  };

  const handleCreateContact = name => {
    setNewContact({ name });
    setContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    setContactModalOpen(false);
  };

  const handleAddNewContactTicket = contact => {
    setSelectedContact(contact);
  };

  return (
    <>
      <ContactModal
        open={contactModalOpen}
        initialValues={newContact}
        onClose={handleCloseContactModal}
        onSave={handleAddNewContactTicket}
      />
      <Dialog open={modalOpen} onClose={handleClose}>
        <DialogTitle id="form-dialog-title">
          {i18n.t("newTicketModal.title")}
        </DialogTitle>
        <DialogContent dividers>
          <Grid style={{ width: 300 }} container spacing={2}>
            <Grid xs={12} item>
              {forcedContact ? (
                <TextField
                  label={i18n.t("common.contact")}
                  value={`${forcedContact.name} (${forcedContact.number})`}
                  variant="outlined"
                  fullWidth
                  disabled
                  margin="dense"
                />
              ) : (
                <ContactSelect
                  onSelected={handleSelectedContact}
                  allowCreate={true}
                  onCreateContact={handleCreateContact}
                />
              )}
            </Grid>
            <Grid xs={12} item>
              <FormControl fullWidth variant="outlined" margin="dense">
                <InputLabel id="queue-label">
                  {i18n.t("common.queue")}
                </InputLabel>
                <Select
                  fullWidth
                  displayEmpty
                  variant="outlined"
                  margin="dense"
                  value={selectedQueue || ""}
                  label={i18n.t("common.queue")}
                  onChange={e => {
                    setSelectedQueue(e.target.value);
                    setSelectedWhatsappId(suggestWhatsapp(e.target.value));
                  }}
                  MenuProps={{
                    anchorOrigin: {
                      vertical: "bottom",
                      horizontal: "left"
                    },
                    transformOrigin: {
                      vertical: "top",
                      horizontal: "left"
                    },
                    getContentAnchorEl: null
                  }}
                  renderValue={() => {
                    if (!selectedQueue) {
                      return;
                    }
                    const queue = user.queues.find(q => q.id === selectedQueue);
                    return queue.name;
                  }}
                >
                  {user.queues?.length > 0 &&
                    user.queues.map((queue, key) => (
                      <MenuItem dense key={key} value={queue.id}>
                        <ListItemText primary={queue.name} />
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12} item>
              <FormControl fullWidth variant="outlined" margin="dense">
                <InputLabel id="whatsapp-label">
                  {i18n.t("newTicketModal.fieldConnectionLabel")}
                </InputLabel>
                <Select
                  fullWidth
                  labelId="whatsapp-label"
                  variant="outlined"
                  margin="dense"
                  value={selectedWhatsappId || ""}
                  label={i18n.t("newTicketModal.fieldConnectionLabel")}
                  onChange={e => setSelectedWhatsappId(e.target.value)}
                  MenuProps={{
                    anchorOrigin: {
                      vertical: "bottom",
                      horizontal: "left"
                    },
                    transformOrigin: {
                      vertical: "top",
                      horizontal: "left"
                    },
                    getContentAnchorEl: null
                  }}
                >
                  {connectedWhatsApps.map(whatsApp => (
                    <MenuItem dense key={whatsApp.id} value={whatsApp.id}>
                      <ListItemText primary={whatsApp.name} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <div style={{ fontSize: "0.8rem", opacity: 0.8, marginTop: 4 }}>
                {i18n.t("newTicketModal.connectionHint")}
              </div>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleClose}
            color="secondary"
            disabled={loading}
            variant="outlined"
          >
            {i18n.t("newTicketModal.buttons.cancel")}
          </Button>
          <ButtonWithSpinner
            variant="contained"
            type="button"
            disabled={!selectedContact}
            onClick={() => handleSaveTicket(selectedContact?.id)}
            color="primary"
            loading={loading}
          >
            {i18n.t("newTicketModal.buttons.ok")}
          </ButtonWithSpinner>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default NewTicketModal;
