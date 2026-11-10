import React, { useState, useEffect, useContext, useRef } from "react";

import Paper from "@material-ui/core/Paper";
import Container from "@material-ui/core/Container";
import Grid from "@material-ui/core/Grid";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import Alert from "@material-ui/lab/Alert";

// ICONS
import GroupAddIcon from "@material-ui/icons/GroupAdd";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import TimerIcon from "@material-ui/icons/Timer";
import ChatIcon from "@material-ui/icons/Chat";
import ReplyIcon from "@material-ui/icons/Reply";
import SpeakerNotesOffIcon from "@material-ui/icons/SpeakerNotesOff";
import TrendingUpIcon from "@material-ui/icons/TrendingUp";
import { corTaxaResposta, textoTaxa } from "../../helpers/taxaResposta";

import { makeStyles } from "@material-ui/core/styles";
import { grey, blue } from "@material-ui/core/colors";
import { toast } from "react-toastify";

import TableAttendantsStatus from "../../components/Dashboard/TableAttendantsStatus";
import GestoresPainel from "../../components/Dashboard/GestoresPainel";
import BlogFeedCarousel from "../../components/Dashboard/BlogFeedCarousel";

import { isEmpty } from "lodash";
import moment from "moment";
import { i18n } from "../../translate/i18n";
import OnlyForSuperUser from "../../components/OnlyForSuperUser";
import useAuth from "../../hooks/useAuth.js";
import { loadJSON } from "../../helpers/loadJSON";

import { SmallPie } from "./SmallPie";
import { TicketCountersChart } from "./TicketCountersChart";
import { getTimezoneOffset } from "../../helpers/getTimezoneOffset.js";

import TicketzRegistry from "../../components/TicketzRegistry";
import ContainerUpdatesBanner from "../../components/Dashboard/ContainerUpdatesBanner";
import { copyToClipboard } from "../../helpers/copyToClipboard.js";
import api from "../../services/api.js";
import config from "../../services/config.js";
import { SocketContext } from "../../context/Socket/SocketContext.js";
import { formatTimeInterval } from "../../helpers/formatTimeInterval.js";
import TicketzProAd from "../../components/Dashboard/TicketzProAd";

const gitinfo = loadJSON("/gitinfo.json");

const useStyles = makeStyles(theme => ({
  container: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4)
  },
  fixedHeightPaper: {
    padding: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    height: 240,
    overflowY: "auto",
    ...theme.scrollbarStyles
  },
  pixkey: {
    fontSize: "9pt"
  },
  paymentimg: {
    maxWidth: "75%",
    marginTop: 10
  },
  paymentpix: {
    maxWidth: "100%",
    maxHeight: 130,
    padding: "5px",
    backgroundColor: "white",
    borderColor: "black",
    borderStyle: "solid",
    borderWidth: "2px"
  },
  supportPaper: {
    padding: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    overflowY: "clip",
    height: 300,
    backgroundColor: theme.palette.secondary.main,
    color: theme.palette.secondary.contrastText,
    ...theme.scrollbarStyles
  },
  supportBox: {
    backgroundColor: theme.palette.secondary.light,
    borderRadius: "10px",
    textAlign: "center",
    borderColor: theme.palette.secondary.main,
    borderWidth: "3px",
    borderStyle: "solid",
    transition: "max-height 0.5s ease",
    overflow: "clip"
  },
  cardAvatar: {
    fontSize: "55px",
    color: grey[500],
    backgroundColor: "#ffffff",
    width: theme.spacing(7),
    height: theme.spacing(7)
  },
  cardTitle: {
    fontSize: "18px",
    color: blue[700]
  },
  cardSubtitle: {
    color: grey[600],
    fontSize: "14px"
  },
  alignRight: {
    textAlign: "right"
  },
  fullWidth: {
    width: "100%"
  },
  selectContainer: {
    width: "100%",
    textAlign: "left"
  },
  cardSolid: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "hidden",
    flexDirection: "row",
    height: "100%",
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText
  },
  cardGray: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "hidden",
    flexDirection: "row",
    height: "100%",
    color: theme.palette.primary.main
  },
  cardData: {
    display: "block",
    width: "100%",
    zIndex: 1
  },
  cardIcon: {
    width: 100,
    color: theme.palette.primary.light,
    position: "sticky",
    opacity: 0.4,
    right: 0
  },
  cardRingGraph: {
    width: 100,
    position: "sticky",
    right: 0
  },
  ticketzProPaper: {
    padding: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    minHeight: 180,
    backgroundColor: theme.palette.ticketzproad.main,
    color: theme.palette.ticketzproad.contrastText,
    [theme.breakpoints.down("sm")]: {
      minHeight: 260
    },
    ...theme.scrollbarStyles
  },
  ticketzRegistryPaper: {
    padding: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    backgroundColor: theme.palette.background.main,
    color: theme.palette.background.contrastText,
    borderColor: theme.palette.primary.main,
    borderWidth: "3px",
    borderStyle: "solid",
    marginBottom: "1em",
    ...theme.scrollbarStyles
  },
  ticketzProBox: {
    textAlign: "center",
    alignContent: "center"
  },
  ticketzProTextBox: {
    textAlign: "left",
    [theme.breakpoints.down("sm")]: {
      textAlign: "center"
    }
  },
  ticketzProTitle: {
    fontWeight: "bold"
  },
  ticketzProScreen: {
    maxHeight: "160px",
    width: "100%",
    objectFit: "contain",
    [theme.breakpoints.down("sm")]: {
      maxHeight: "220px"
    },
    maxWidth: "100%"
  },
  ticketzProFeatures: {
    padding: 0,
    margin: 0,
    listStyleType: "none",
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(1),
    justifyContent: "flex-start",
    [theme.breakpoints.down("sm")]: {
      justifyContent: "center"
    }
  },
  ticketzProCommand: {
    fontFamily: "monospace",
    backgroundColor: "#00000080"
  },
  clickpointer: {
    cursor: "pointer"
  }
}));

const InfoCard = ({ title, value, icon }) => {
  const classes = useStyles();

  return (
    <Grid item xs={12} sm={6} md={3}>
      <Paper className={classes.cardGray} elevation={6}>
        <div className={classes.cardData}>
          <Typography component="h3" variant="h6" paragraph>
            {title}
          </Typography>
          <Typography component="h1" variant="h4">
            {value}
          </Typography>
        </div>
        <div className={classes.cardIcon}>{icon}</div>
      </Paper>
    </Grid>
  );
};

const InfoRingCard = ({ title, value, graph }) => {
  const classes = useStyles();
  return (
    <Grid item xs={12} sm={4}>
      <Paper className={classes.cardSolid} elevation={4}>
        <div className={classes.cardData}>
          <Typography component="h3" variant="h6" paragraph>
            {title}
          </Typography>
          <Typography component="h1" variant="h4">
            {value}
          </Typography>
        </div>
        <div className={classes.cardRingGraph}>
          <div style={{ width: "100px", height: "100px" }}>{graph}</div>
        </div>
      </Paper>
    </Grid>
  );
};

const Dashboard = () => {
  const classes = useStyles();
  const [period, setPeriod] = useState(0);
  const [currentUser, setCurrentUser] = useState({});
  const [dateFrom, setDateFrom] = useState(
    moment("1", "D").format("YYYY-MM-DDTHH") + ":00"
  );
  // fim do dia, nao a hora em que a pagina abriu (2026-11-02: trocando so a
  // data, o periodo terminava as 8h59 e o painel mostrava o dia quase vazio)
  const [dateTo, setDateTo] = useState(
    moment().format("YYYY-MM-DD") + "T23:59"
  );
  const { getCurrentUserInfo } = useAuth();

  const [supportPix, setSupportPix] = useState(false);
  const [supportIsBr, setSupportIsBr] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [proInstructionsOpen, setProInstructionsOpen] = useState(false);

  const [usersOnlineTotal, setUsersOnlineTotal] = useState(0);
  const [usersOfflineTotal, setUsersOfflineTotal] = useState(0);
  const [usersStatusChartData, setUsersStatusChartData] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingChartData, setPendingChartData] = useState([]);
  const [openedTotal, setOpenedTotal] = useState(0);
  const [openedChartData, setOpenedChartData] = useState([]);

  const [ticketsData, setTicketsData] = useState({});
  const [usersData, setUsersData] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // numeros escondidos pelo olho (ids de usuario), lembrados neste navegador:
  // o Francisco apresenta o painel em call e mostra so quem ele quiser
  const [ocultos, setOcultos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("painel.ocultos")) || [];
    } catch (e) {
      return [];
    }
  });
  const guardarOcultos = lista => {
    setOcultos(lista);
    try {
      localStorage.setItem("painel.ocultos", JSON.stringify(lista));
    } catch (e) {
      // sem armazenamento: vale so ate recarregar a pagina
    }
  };
  const alternarOculto = id =>
    guardarOcultos(
      ocultos.includes(id) ? ocultos.filter(x => x !== id) : [...ocultos, id]
    );
  const alternarTodos = (ids, todosOcultos) =>
    guardarOcultos(
      todosOcultos
        ? ocultos.filter(x => !ids.includes(x))
        : [...new Set([...ocultos, ...ids])]
    );
  // alguem escondido no painel (2026-11-02, pedido do Pedro): os totais somam
  // so quem esta visivel (o backend recebe os ocultos) e um aviso diz quem
  // ficou de fora. O grafico de atendimentos nao separa por pessoa: fica
  // embacado enquanto algum vendedor estiver oculto.
  const ocultosRef = useRef(ocultos);
  ocultosRef.current = ocultos;
  const vendedoresOcultos = (usersData.userReport || []).filter(u =>
    ocultos.includes(u.id)
  );
  const ocultarTotais = vendedoresOcultos.length > 0;
  const total = valor => valor;
  const nomesOcultos = vendedoresOcultos.map(u => u.name);
  const avisoOcultos = !nomesOcultos.length
    ? null
    : nomesOcultos.length === 1
      ? `${nomesOcultos[0]} não está contando nos totais (números ocultos). Clique no olho ao lado do nome para somar junto.`
      : `${nomesOcultos.slice(0, -1).join(", ")} e ${nomesOcultos[nomesOcultos.length - 1]} não estão contando nos totais (números ocultos). Clique no olho ao lado de cada nome para somar junto.`;
  // painel do comercial: o backend manda as contagens pelas mensagens
  const comercial =
    ticketsData.ticketStatistics?.conversasAtendidas !== undefined;

  const socketManager = useContext(SocketContext);
  const companyId = localStorage.getItem("companyId");

  async function showProInstructions() {
    if (gitinfo.commitHash) {
      setProInstructionsOpen(true);
      return;
    }

    window.open("https://pro.ticke.tz", "_blank");
  }

  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then(res => res.json())
      .then(data => {
        if (data.country === "BR") {
          setSupportPix(true);
          setSupportIsBr(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const socket = socketManager.GetSocket(companyId);

    socket.on("userOnlineChange", updateStatus);
    socket.on("counter", updateStatus);

    return () => {
      socket.disconnect();
    };
  }, [socketManager, companyId]);

  useEffect(() => {
    getCurrentUserInfo().then(user => {
      if (!["admin", "supervisor"].includes(user?.profile)) {
        window.location.href = "/tickets";
      }
      setCurrentUser(user);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.get("/ticketz/registry").then(result => {
      const registry = result.data;
      setRegistered(registry?.disabled || !!registry?.whatsapp);
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [period]);

  async function handleChangePeriod(value) {
    setPeriod(value);
  }

  async function updateStatus() {
    api
      .get("/dashboard/status", {
        params: { ocultos: ocultosRef.current.join(",") }
      })
      .then(result => {
        const { data } = result;

        if (!data) return;

        let usersOnlineTotal = 0;
        let usersOfflineTotal = 0;
        data.usersStatusSummary.forEach(item => {
          if (item.online) {
            usersOnlineTotal++;
          } else {
            usersOfflineTotal++;
          }
        });

        setUsersStatusChartData([
          {
            name: "Online",
            value: usersOnlineTotal,
            color: "#00ff00"
          },
          {
            name: "Offline",
            value: usersOfflineTotal,
            color: "#ff0000"
          }
        ]);

        setUsersOnlineTotal(usersOnlineTotal);
        setUsersOfflineTotal(usersOfflineTotal);

        let pendingTotal = 0;
        let openedTotal = 0;
        const pendingChartData = [];
        const openedChartData = [];
        data.ticketsStatusSummary.forEach(item => {
          if (item.status === "pending") {
            pendingTotal += Number(item.count);
            pendingChartData.push({
              name: item.queue?.name || i18n.t("common.noqueue"),
              value: Number(item.count),
              color: item.queue?.color || "#888"
            });
            return;
          }
          if (item.status === "open") {
            openedTotal += Number(item.count);
            openedChartData.push({
              name: item.queue?.name || i18n.t("common.noqueue"),
              value: Number(item.count),
              color: item.queue?.color || "#888"
            });
          }
        });
        setPendingTotal(pendingTotal);
        setPendingChartData(pendingChartData);
        setOpenedTotal(openedTotal);
        setOpenedChartData(openedChartData);
      })
      .catch(() => {});
  }

  async function fetchData() {
    let params = {
      tz: getTimezoneOffset(),
      ocultos: ocultosRef.current.join(",")
    };

    // Hoje / Ontem: o dia inteiro (2026-11-02, metricas diarias do comercial)
    const diaInteiro = { hoje: 0, ontem: 1 }[period];
    const days = diaInteiro === undefined ? Number(period) : 0;

    if (diaInteiro !== undefined) {
      const dia = moment().subtract(diaInteiro, "days").format("YYYY-MM-DD");
      params = { ...params, date_from: dia, date_to: dia };
    }

    if (days) {
      // mantem o fuso (antes o periodo saia em UTC, 3h deslocado)
      params = {
        ...params,
        date_from: moment().subtract(days, "days").format("YYYY-MM-DD"),
        date_to: moment().format("YYYY-MM-DD")
      };
    }

    const personalizado = !days && diaInteiro === undefined;

    if (personalizado && !isEmpty(dateFrom) && moment(dateFrom).isValid()) {
      params = {
        ...params,
        date_from: moment(dateFrom).format("YYYY-MM-DD"),
        hour_from: moment(dateFrom).format("HH:mm:ss")
      };
    }

    if (personalizado && !isEmpty(dateTo) && moment(dateTo).isValid()) {
      params = {
        ...params,
        date_to: moment(dateTo).format("YYYY-MM-DD"),
        hour_to: moment(dateTo).format("HH:mm:ss")
      };
    }

    if (Object.keys(params).length === 0) {
      toast.error(i18n.t("dashboard.filter.invalid"));
      return;
    }

    api
      .get("/dashboard/tickets", { params })
      .then(result => {
        if (result?.data) {
          setTicketsData(result.data);
        }
      })
      .catch(() => {});

    setLoadingUsers(true);
    api
      .get("/dashboard/users", { params })
      .then(result => {
        if (result?.data) {
          setUsersData(result.data);
          setLoadingUsers(false);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    updateStatus();
  }, []);

  // olho aberto/fechado: os totais refazem a soma sem quem esta oculto
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    fetchData();
    updateStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocultos.join(",")]);

  function renderFilters() {
    return (
      <>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl className={classes.selectContainer}>
            <InputLabel id="period-selector-label">
              {i18n.t("dashboard.filter.period")}
            </InputLabel>
            <Select
              labelId="period-selector-label"
              id="period-selector"
              value={period}
              onChange={e => handleChangePeriod(e.target.value)}
            >
              <MenuItem value={0}>{i18n.t("dashboard.filter.custom")}</MenuItem>
              <MenuItem value="hoje">Hoje</MenuItem>
              <MenuItem value="ontem">Ontem</MenuItem>
              <MenuItem value={3}>
                {i18n.t("dashboard.filter.last3days")}
              </MenuItem>
              <MenuItem value={7}>
                {i18n.t("dashboard.filter.last7days")}
              </MenuItem>
              <MenuItem value={15}>
                {i18n.t("dashboard.filter.last14days")}
              </MenuItem>
              <MenuItem value={30}>
                {i18n.t("dashboard.filter.last30days")}
              </MenuItem>
              <MenuItem value={90}>
                {i18n.t("dashboard.filter.last90days")}
              </MenuItem>
            </Select>
          </FormControl>
        </Grid>
        {!period && (
          <>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label={i18n.t("dashboard.date.start")}
                type="datetime-local"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                onBlur={fetchData}
                className={classes.fullWidth}
                InputLabelProps={{
                  shrink: true
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label={i18n.t("dashboard.date.end")}
                type="datetime-local"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                onBlur={fetchData}
                className={classes.fullWidth}
                InputLabelProps={{
                  shrink: true
                }}
              />
            </Grid>
          </>
        )}
        <Grid item xs={12} sm={6} md={period ? 9 : 3} />
      </>
    );
  }

  if (!["admin", "supervisor"].includes(currentUser?.profile)) {
    return <div></div>;
  }

  return (
    <div>
      <Container maxWidth="lg" className={classes.container}>
        <OnlyForSuperUser
          user={currentUser}
          yes={() => (
            <>
              <Grid container spacing={3} justifyContent="flex-start">
                {config.TZAUTOINSTALLER === "1" && <ContainerUpdatesBanner />}
                {!localStorage.getItem("hideAds") && (
                  <>
                    <Grid item xs={12}>
                      {!registered && (
                        <Paper className={classes.ticketzRegistryPaper}>
                          <TicketzRegistry onRegister={setRegistered} />
                        </Paper>
                      )}
                    </Grid>
                    <Grid item xs={12}>
                      <TicketzProAd
                        classes={classes}
                        proInstructionsOpen={proInstructionsOpen}
                        onShowProInstructions={showProInstructions}
                        hasCommitHash={!!gitinfo.commitHash}
                      />
                    </Grid>
                  </>
                )}
              </Grid>
              <Grid container spacing={3} justifyContent="flex-start">
                <Grid item xs={12} md={8}>
                  <BlogFeedCarousel />
                </Grid>

                {!localStorage.getItem("hideAds") && (
                  <Grid item xs={12} md={4}>
                    <Paper className={classes.supportPaper}>
                      <Typography
                        style={{ overflow: "hidden" }}
                        component="h2"
                        variant="h6"
                        gutterBottom
                      >
                        {i18n.t("ticketz.support.title")}
                      </Typography>
                      <Grid container justifyContent="flex-end">
                        <Grid
                          className={classes.supportBox}
                          style={{ maxHeight: supportPix ? 300 : 35 }}
                          item
                          xs={12}
                        >
                          <Typography
                            className={classes.clickpointer}
                            component="h3"
                            variant="h6"
                            gutterBottom
                            onClick={() => setSupportPix(true)}
                          >
                            PIX
                          </Typography>
                          <div
                            className={classes.clickpointer}
                            onClick={() => {
                              copyToClipboard(
                                "1ab11506-9480-4303-8e1e-988e7c49ed4d"
                              );
                              toast.success("Chave PIX copiada");
                            }}
                          >
                            <div>
                              <img
                                className={classes.paymentpix}
                                src="/ticketzpix.png"
                                alt="PIX"
                              />
                            </div>
                            <Typography
                              className={classes.pixkey}
                              component="body2"
                              paragraph
                            >
                              Clique para copiar a chave PIX
                            </Typography>
                          </div>
                        </Grid>
                        <Grid
                          className={classes.supportBox}
                          style={{ maxHeight: supportPix ? 35 : 300 }}
                          item
                          xs={12}
                          onClick={() => setSupportPix(false)}
                        >
                          <Typography
                            className={classes.clickpointer}
                            component="h3"
                            variant="h6"
                            gutterBottom
                            onClick={() => setSupportPix(true)}
                          >
                            {i18n.t("ticketz.support.mercadopagotitle")}
                          </Typography>
                          {supportPix || (
                            <>
                              {supportIsBr && (
                                <>
                                  <Typography component="body2" paragraph>
                                    {i18n.t("ticketz.support.recurringbrl")}
                                  </Typography>
                                  <div>
                                    <a
                                      href="https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=2c9380848f1b8ed1018f2b011f90061f"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <img
                                        className={classes.paymentimg}
                                        src="/mercadopago.png"
                                        alt="Mercado Pago"
                                      />
                                    </a>
                                  </div>
                                </>
                              )}
                              {!supportIsBr && (
                                <>
                                  <Typography component="body2" paragraph>
                                    {i18n.t("ticketz.support.international")}
                                  </Typography>
                                  <div>
                                    <a
                                      href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=X6XHVCPMRQEL4"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <img
                                        className={classes.paymentimg}
                                        src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif"
                                        alt="PayPal"
                                      />
                                    </a>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </Grid>
                      </Grid>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            </>
          )}
        />

        <Grid container spacing={3} justifyContent="flex-start">
          {/* USUARIOS ONLINE */}
          <InfoRingCard
            title={i18n.t("dashboard.usersOnline")}
            value={`${usersOnlineTotal}/${usersOnlineTotal + usersOfflineTotal}`}
            graph={<SmallPie chartData={usersStatusChartData} />}
          />

          {/* ATENDIMENTOS PENDENTES */}
          <InfoRingCard
            title={i18n.t("dashboard.ticketsWaiting")}
            value={total(pendingTotal)}
            graph={
              ocultarTotais ? null : <SmallPie chartData={pendingChartData} />
            }
          />

          {/* ATENDIMENTOS ACONTECENDO */}
          <InfoRingCard
            title={i18n.t("dashboard.ticketsOpen")}
            value={total(openedTotal)}
            graph={
              ocultarTotais ? null : <SmallPie chartData={openedChartData} />
            }
          />

          {/* FILTROS */}
          {renderFilters()}

          {avisoOcultos && (
            <Grid item xs={12}>
              <Alert severity="info">{avisoOcultos}</Alert>
            </Grid>
          )}

          {/* ATENDIMENTOS REALIZADOS (comercial: conversas atendidas, porque
              ninguem finaliza conversa e "resolvidos" ficava sempre zerado) */}
          <InfoCard
            title={
              comercial
                ? "Conversas atendidas"
                : i18n.t("dashboard.ticketsDone")
            }
            value={total(
              (comercial
                ? ticketsData.ticketStatistics?.conversasAtendidas
                : ticketsData.ticketStatistics?.totalClosed) || 0
            )}
            icon={<CheckCircleIcon style={{ fontSize: 100 }} />}
          />

          {/* NOVOS CONTATOS (comercial: mensagens enviadas pelos vendedores) */}
          <InfoCard
            title={
              comercial ? "Mensagens enviadas" : i18n.t("dashboard.newContacts")
            }
            value={total(
              (comercial
                ? ticketsData.ticketStatistics?.mensagensEnviadas
                : ticketsData.ticketStatistics?.newContacts) || 0
            )}
            icon={<GroupAddIcon style={{ fontSize: 100 }} />}
          />

          {/* T.M. DE ATENDIMENTO */}
          <InfoCard
            title={
              comercial
                ? "Tempo médio de atendimento"
                : i18n.t("dashboard.avgServiceTime")
            }
            value={total(
              formatTimeInterval(ticketsData.ticketStatistics?.avgServiceTime)
            )}
            icon={<TimerIcon style={{ fontSize: 100 }} />}
          />

          {/* T.M. DE ESPERA (comercial: quanto o cliente espera a resposta
              do vendedor, so no horario do comercial) */}
          <InfoCard
            title={
              comercial
                ? "Tempo médio para responder"
                : i18n.t("dashboard.avgWaitTime")
            }
            value={total(
              formatTimeInterval(ticketsData.ticketStatistics?.avgWaitTime)
            )}
            icon={<HourglassEmptyIcon style={{ fontSize: 100 }} />}
          />

          {/* TAXA DE RESPOSTA (comercial, 2026-11-09, pedido da Bia): conversa
              x dia em que o cliente escreveu; respondida = o vendedor mandou
              mensagem depois; sem resposta = ficou no vacuo */}
          {comercial && (
            <>
              <InfoCard
                title="Clientes que escreveram"
                value={total(
                  ticketsData.ticketStatistics?.conversasRecebidas || 0
                )}
                icon={<ChatIcon style={{ fontSize: 100 }} />}
              />
              <InfoCard
                title="Respondidos"
                value={total(
                  ticketsData.ticketStatistics?.conversasRespondidas || 0
                )}
                icon={<ReplyIcon style={{ fontSize: 100 }} />}
              />
              <InfoCard
                title="Sem resposta (vácuo)"
                value={total(
                  ticketsData.ticketStatistics?.conversasSemResposta || 0
                )}
                icon={<SpeakerNotesOffIcon style={{ fontSize: 100 }} />}
              />
              <InfoCard
                title="Taxa de resposta"
                value={
                  <span
                    style={{
                      color: corTaxaResposta(
                        ticketsData.ticketStatistics?.taxaResposta
                      )
                    }}
                  >
                    {total(
                      textoTaxa(ticketsData.ticketStatistics?.taxaResposta)
                    )}
                  </span>
                }
                icon={<TrendingUpIcon style={{ fontSize: 100 }} />}
              />
            </>
          )}

          {/* DASHBOARD ATENDIMENTOS NO PERÍODO */}
          <Grid item xs={12}>
            <Paper className={classes.fixedHeightPaper}>
              <div style={ocultarTotais ? { filter: "blur(8px)" } : undefined}>
                <TicketCountersChart
                  ticketCounters={ticketsData.ticketCounters}
                />
              </div>
            </Paper>
          </Grid>

          {/* USER REPORT */}
          <Grid item xs={12}>
            {usersData.userReport?.length ? (
              <TableAttendantsStatus
                attendants={usersData.userReport}
                loading={loadingUsers}
                ocultos={ocultos}
                onAlternar={alternarOculto}
                onAlternarTodos={alternarTodos}
              />
            ) : null}
          </Grid>

          {/* GESTAO (painel do comercial): tempo medio conectada por dia */}
          {usersData.gestores?.length ? (
            <Grid item xs={12}>
              <GestoresPainel
                gestores={usersData.gestores}
                ocultos={ocultos}
                onAlternar={alternarOculto}
              />
            </Grid>
          ) : null}
        </Grid>
      </Container>
    </div>
  );
};

export default Dashboard;
