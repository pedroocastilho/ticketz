import React, {
  useState,
  useEffect,
  useReducer,
  useContext,
  useRef
} from "react";

import { makeStyles } from "@material-ui/core/styles";
import List from "@material-ui/core/List";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";

import TicketListItem from "../TicketListItemCustom";
import TicketsListSkeleton from "../TicketsListSkeleton";

import useTickets from "../../hooks/useTickets";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { SocketContext } from "../../context/Socket/SocketContext";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import ConfirmationModal from "../ConfirmationModal";

const useStyles = makeStyles(theme => ({
  ticketsListWrapper: {
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0
  },

  ticketsList: {
    flex: 1,
    maxHeight: "100%",
    overflowY: "scroll",
    ...theme.scrollbarStyles,
    borderTop: "2px solid rgba(0, 0, 0, 0.12)"
  },

  ticketsListHeader: {
    color: "rgb(67, 83, 105)",
    zIndex: 2,
    backgroundColor: "white",
    borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },

  ticketsCount: {
    fontWeight: "normal",
    color: "rgb(104, 121, 146)",
    marginLeft: "8px",
    fontSize: "14px"
  },

  noTicketsText: {
    textAlign: "center",
    color: "rgb(104, 121, 146)",
    fontSize: "14px",
    lineHeight: "1.4"
  },

  noTicketsTitle: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0px"
  },

  // selecionar e resolver varias conversas de uma vez (aba Atendendo)
  selecaoBarra: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
    fontSize: 13,
    color: "rgb(104, 121, 146)"
  },
  selecaoItem: {
    display: "flex",
    alignItems: "center",
    cursor: "pointer"
  },
  selecaoConteudo: {
    flex: 1,
    minWidth: 0,
    pointerEvents: "none"
  },
  carregarMais: {
    display: "flex",
    justifyContent: "center",
    padding: 8
  },

  noTicketsDiv: {
    display: "flex",
    height: "100px",
    margin: 40,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
  }
}));

const reducer = (state, action) => {
  if (action.type === "LOAD_TICKETS") {
    const newTickets = action.payload;

    newTickets.forEach(ticket => {
      const ticketIndex = state.findIndex(t => t.id === ticket.id);
      if (ticketIndex !== -1) {
        state[ticketIndex] = ticket;
        if (ticket.unreadMessages > 0) {
          state.unshift(state.splice(ticketIndex, 1)[0]);
        }
      } else {
        state.push(ticket);
      }
    });

    return [...state];
  }

  if (action.type === "RESET_UNREAD") {
    const ticketId = action.payload;

    const ticketIndex = state.findIndex(t => t.id === ticketId);
    if (ticketIndex !== -1) {
      state[ticketIndex].unreadMessages = 0;
    }

    return [...state];
  }

  if (action.type === "UPDATE_TICKET") {
    const ticket = action.payload;

    const ticketIndex = state.findIndex(t => t.id === ticket.id);
    if (ticketIndex !== -1) {
      state.splice(ticketIndex, 1);
    }

    const idx = state.findIndex(
      t =>
        new Date(t.updatedAt) < new Date(ticket.updatedAt) ||
        (t.updatedAt === ticket.updatedAt && t.id < ticket.id)
    );
    state.splice(idx < 0 ? state.length : idx, 0, ticket);

    return [...state];
  }

  if (action.type === "UPDATE_TICKET_UNREAD_MESSAGES") {
    const ticket = action.payload;

    const ticketIndex = state.findIndex(t => t.id === ticket.id);
    if (ticketIndex !== -1) {
      state[ticketIndex] = ticket;
      state.unshift(state.splice(ticketIndex, 1)[0]);
    } else {
      state.unshift(ticket);
    }

    return [...state];
  }

  if (action.type === "UPDATE_TICKET_CONTACT") {
    const contact = action.payload;
    state.forEach(ticket => {
      if (ticket.contactId === contact.id) {
        ticket.contact = { ...ticket.contact, ...contact };
      }
    });
    return [...state];
  }

  if (action.type === "UPDATE_TICKET_PRESENCE") {
    const data = action.payload;
    const ticketIndex = state.findIndex(t => t.id === data.ticketId);
    if (ticketIndex !== -1) {
      state[ticketIndex].presence = data.presence;
    }
    return [...state];
  }

  if (action.type === "DELETE_TICKET") {
    const ticketId = action.payload;
    const ticketIndex = state.findIndex(t => t.id === ticketId);
    if (ticketIndex !== -1) {
      state.splice(ticketIndex, 1);
    }

    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const TicketsListCustom = props => {
  const {
    status,
    groups,
    isSearch,
    searchParam,
    contactId,
    tags,
    users,
    showAll,
    selectedQueueIds,
    updateCount,
    style,
    setTabOpen,
    showTabGroups
  } = props;
  const classes = useStyles();
  const [paginationCursor, setPaginationCursor] = useState({
    nextUpdatedAt: null,
    nextTicketId: null
  });
  const [update, setUpdate] = useState(0);
  const [ticketsList, dispatch] = useReducer(reducer, []);
  const ticketsListRef = useRef(ticketsList);
  useEffect(() => {
    ticketsListRef.current = ticketsList;
  }, [ticketsList]);
  const [ticketsListUpdated, setTicketsListUpdated] = useState([]);
  const { user } = useContext(AuthContext);
  const { profile, queues } = user;

  const socketManager = useContext(SocketContext);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPaginationCursor({ nextUpdatedAt: null, nextTicketId: null });
  }, [
    status,
    searchParam,
    dispatch,
    showAll,
    contactId,
    tags,
    users,
    selectedQueueIds
  ]);

  const {
    tickets,
    hasMore,
    loading,
    nextUpdatedAt,
    nextTicketId,
    refetch: refetchTickets,
    fetchSince
  } = useTickets({
    nextUpdatedAt: paginationCursor.nextUpdatedAt,
    nextTicketId: paginationCursor.nextTicketId,
    isSearch,
    searchParam,
    status,
    groups,
    showAll,
    contactId,
    tags: JSON.stringify(tags),
    users: JSON.stringify(users),
    queueIds: JSON.stringify(selectedQueueIds)
  });

  useEffect(() => {
    const queueIds = queues.map(q => q.id);
    const filteredTickets = tickets.filter(
      t => queueIds.indexOf(t.queueId) > -1
    );

    if (profile === "user") {
      dispatch({ type: "LOAD_TICKETS", payload: filteredTickets });
    } else {
      dispatch({ type: "LOAD_TICKETS", payload: tickets });
    }
  }, [tickets, queues, profile]);

  useEffect(() => {
    const companyId = localStorage.getItem("companyId");
    const socket = socketManager.GetSocket(companyId);

    const shouldUpdateTicket = ticket => {
      return (
        (!isSearch || !searchParam) &&
        (!contactId || ticket.contactId === contactId) &&
        (!tags?.length ||
          tags.some(
            tag =>
              ticket.tags.some(t => t.id === tag) ||
              ticket.contact.tags.some(t => t.id === tag)
          )) &&
        (!users?.length || users.some(u => u === ticket.userId)) &&
        (!ticket.userId || ticket.userId === user?.id || showAll) &&
        (!ticket.queueId || selectedQueueIds.indexOf(ticket.queueId) > -1)
      );
    };

    const notBelongsToUserQueues = ticket =>
      ticket.queueId && selectedQueueIds.indexOf(ticket.queueId) === -1;

    const onConnectTicketList = () => {
      if (status) {
        socket.emit("joinTickets", status);
      } else {
        socket.emit("joinNotification");
      }
    };

    const onCompanyTicket = data => {
      if (data.action === "updateUnread") {
        dispatch({
          type: "RESET_UNREAD",
          payload: data.ticketId
        });
      }

      if (
        data.action === "update" &&
        data.ticket.status === status &&
        shouldUpdateTicket(data.ticket)
      ) {
        dispatch({
          type: "UPDATE_TICKET",
          payload: data.ticket
        });
      }

      if (
        groups &&
        data.action === "update" &&
        data.ticket.isGroup &&
        shouldUpdateTicket(data.ticket)
      ) {
        dispatch({
          type: "UPDATE_TICKET",
          payload: data.ticket
        });
      }

      if (data.action === "update" && notBelongsToUserQueues(data.ticket)) {
        dispatch({ type: "DELETE_TICKET", payload: data.ticket?.id });
      }

      if (data.action === "delete") {
        dispatch({ type: "DELETE_TICKET", payload: data?.ticketId });
      }

      if (data.action === "removeFromList") {
        dispatch({ type: "DELETE_TICKET", payload: data.ticketId });
      }
    };

    const onCompanyAppMessage = data => {
      console.debug("appMessage event received", data);
      if (showTabGroups && !!data.ticket?.isGroup !== !!groups) {
        return;
      }

      const queueIds = queues.map(q => q.id);
      if (
        profile === "user" &&
        (queueIds.indexOf(data.ticket?.queue?.id) === -1 ||
          data.ticket.queue === null)
      ) {
        return;
      }

      if (
        data.action === "create" &&
        (!showTabGroups || !!data.ticket?.isGroup === !!groups) &&
        shouldUpdateTicket(data.ticket) &&
        (status === undefined || data.ticket.status === status)
      ) {
        dispatch({
          type: "UPDATE_TICKET_UNREAD_MESSAGES",
          payload: data.ticket
        });
      }
    };

    const onCompanyContact = data => {
      if (data.action === "update") {
        dispatch({
          type: "UPDATE_TICKET_CONTACT",
          payload: data.contact
        });
      }
    };

    socketManager.onConnect(onConnectTicketList);

    socket.on(`company-${companyId}-ticket`, onCompanyTicket);
    socket.on(`company-${companyId}-appMessage`, onCompanyAppMessage);
    socket.on(`company-${companyId}-contact`, onCompanyContact);
    socket.on("wsRefreshRequired", refreshRequired => {
      if (refreshRequired) {
        const currentList = ticketsListRef.current;
        if (currentList.length > 0) {
          const maxUpdatedAt = currentList.reduce(
            (max, ticket) => (ticket.updatedAt > max ? ticket.updatedAt : max),
            currentList[0].updatedAt
          );

          fetchSince(maxUpdatedAt)
            .then(newTickets => {
              newTickets.forEach(ticket => {
                dispatch({ type: "UPDATE_TICKET", payload: ticket });
              });
            })
            .catch(err => {
              toastError(err);
            });
        } else {
          dispatch({ type: "RESET" });
          setPaginationCursor({ nextUpdatedAt: null, nextTicketId: null });
          refetchTickets();
        }
      }
    });

    socket.on(`company-${companyId}-presence`, data => {
      dispatch({
        type: "UPDATE_TICKET_PRESENCE",
        payload: data
      });
    });

    return () => {
      if (status) {
        socket.emit("leaveTickets", status);
      } else {
        socket.emit("leaveNotification");
      }
      socket.disconnect();
    };
  }, [
    status,
    isSearch,
    searchParam,
    showAll,
    groups,
    showTabGroups,
    user,
    selectedQueueIds,
    contactId,
    tags,
    users,
    profile,
    queues,
    socketManager,
    refetchTickets
  ]);

  useEffect(() => {
    if (typeof updateCount === "function") {
      updateCount(ticketsList.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketsList]);

  const loadMore = () => {
    const lastTicket = ticketsList[ticketsList.length - 1];
    if (!lastTicket) return;
    if (
      paginationCursor.nextUpdatedAt === lastTicket.updatedAt &&
      paginationCursor.nextTicketId === lastTicket.id
    ) {
      return;
    }
    setPaginationCursor({
      nextUpdatedAt: lastTicket.updatedAt,
      nextTicketId: lastTicket.id
    });
  };

  // Selecionar e resolver de uma vez (2026-10-29, pedido da Isabela: 253 conversas em
  // Atendendo, muitas ja terminadas). Resolve como o botao do item: sem mensagem de
  // despedida nem pesquisa para o cliente (justClose). So na aba Atendendo.
  const podeSelecionar = status === "open";
  const [selecionando, setSelecionando] = useState(false);
  const [selecionados, setSelecionados] = useState([]);
  const [confirmarResolver, setConfirmarResolver] = useState(false);
  const [resolvendo, setResolvendo] = useState(null);

  const alternarSelecao = id =>
    setSelecionados(atual =>
      atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]
    );

  const sairDaSelecao = () => {
    setSelecionando(false);
    setSelecionados([]);
  };

  const resolverSelecionados = async () => {
    const ids = [...selecionados];
    setResolvendo({ feitos: 0, total: ids.length });
    let falhas = 0;
    // uma por vez: o servidor processa cada conversa (mesmo caminho do botao de resolver)
    // eslint-disable-next-line no-restricted-syntax
    for (const [i, id] of ids.entries()) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await api.put(`/tickets/${id}`, {
          status: "closed",
          justClose: true,
          userId: user?.id
        });
        dispatch({ type: "DELETE_TICKET", payload: id });
      } catch (err) {
        falhas += 1;
        if (falhas === 1) toastError(err);
      }
      setResolvendo({ feitos: i + 1, total: ids.length });
    }
    setResolvendo(null);
    sairDaSelecao();
  };

  // "Carregar mais": se a ultima pagina falhou (servidor lento), o cursor ja aponta
  // para a ultima conversa e a rolagem nao pedia de novo; aqui tenta outra vez
  const carregarMais = () => {
    const lastTicket = ticketsList[ticketsList.length - 1];
    if (
      lastTicket &&
      paginationCursor.nextUpdatedAt === lastTicket.updatedAt &&
      paginationCursor.nextTicketId === lastTicket.id
    ) {
      refetchTickets();
    } else {
      loadMore();
    }
  };
  const talvezTenhaMais = !loading && ticketsList.length >= 40;

  const handleScroll = e => {
    if (loading) return;

    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  return (
    <Paper className={classes.ticketsListWrapper} style={style}>
      <ConfirmationModal
        title={`Resolver ${selecionados.length} conversa(s)?`}
        open={confirmarResolver}
        onClose={() => setConfirmarResolver(false)}
        onConfirm={resolverSelecionados}
      >
        As conversas selecionadas vao para Resolvidos sem mandar mensagem ao
        cliente. Se o cliente escrever de novo, a conversa volta.
      </ConfirmationModal>
      {podeSelecionar && ticketsList.length > 0 && (
        <div className={classes.selecaoBarra}>
          {resolvendo ? (
            <span>
              Resolvendo {resolvendo.feitos} de {resolvendo.total}...
            </span>
          ) : selecionando ? (
            <>
              <span>{selecionados.length} selecionada(s)</span>
              <Button
                size="small"
                onClick={() => setSelecionados(ticketsList.map(t => t.id))}
              >
                Marcar todas ({ticketsList.length})
              </Button>
              <Button
                size="small"
                color="primary"
                variant="contained"
                disabled={!selecionados.length}
                onClick={() => setConfirmarResolver(true)}
              >
                Resolver selecionadas
              </Button>
              <Button size="small" onClick={sairDaSelecao}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button size="small" onClick={() => setSelecionando(true)}>
              Selecionar para resolver
            </Button>
          )}
        </div>
      )}
      <Paper
        square
        name="closed"
        elevation={0}
        className={classes.ticketsList}
        onScroll={handleScroll}
      >
        <List style={{ paddingTop: 0 }}>
          {ticketsList.length === 0 && !loading ? (
            <div className={classes.noTicketsDiv}>
              <span className={classes.noTicketsTitle}>
                {i18n.t("ticketsList.noTicketsTitle")}
              </span>
              <p className={classes.noTicketsText}>
                {i18n.t("ticketsList.noTicketsMessage")}
              </p>
            </div>
          ) : (
            <>
              {ticketsList.map(ticket =>
                selecionando ? (
                  <div
                    key={ticket.id}
                    className={classes.selecaoItem}
                    onClick={() => alternarSelecao(ticket.id)}
                  >
                    <Checkbox
                      size="small"
                      color="primary"
                      checked={selecionados.includes(ticket.id)}
                    />
                    <div className={classes.selecaoConteudo}>
                      <TicketListItem
                        ticket={ticket}
                        setTabOpen={setTabOpen}
                        groupActionButtons={false}
                      />
                    </div>
                  </div>
                ) : (
                  <TicketListItem
                    ticket={ticket}
                    setTabOpen={setTabOpen}
                    key={ticket.id}
                    groupActionButtons={!groups && !showTabGroups}
                  />
                )
              )}
            </>
          )}
          {loading && <TicketsListSkeleton />}
          {talvezTenhaMais && (
            <div className={classes.carregarMais}>
              <Button size="small" onClick={carregarMais}>
                Carregar mais
              </Button>
            </div>
          )}
        </List>
      </Paper>
    </Paper>
  );
};

export default TicketsListCustom;
