import React, { useState, useRef, useContext } from "react";

import Popover from "@material-ui/core/Popover";
import IconButton from "@material-ui/core/IconButton";
import List from "@material-ui/core/List";
import { makeStyles } from "@material-ui/core/styles";
import VolumeUpIcon from "@material-ui/icons/VolumeUp";
import VolumeDownIcon from "@material-ui/icons/VolumeDown";

import {
  Checkbox,
  Divider,
  FormControlLabel,
  FormGroup,
  Grid,
  Slider,
  Typography
} from "@material-ui/core";

import { i18n } from "../../translate/i18n";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";

const useStyles = makeStyles(theme => ({
  tabContainer: {
    padding: theme.spacing(2)
  },
  popoverPaper: {
    width: "100%",
    maxWidth: 350,
    marginLeft: theme.spacing(2),
    marginRight: theme.spacing(1),
    [theme.breakpoints.down("sm")]: {
      maxWidth: 270
    }
  },
  noShadow: {
    boxShadow: "none !important"
  },
  icons: {
    color: theme.palette.primary.contrastText
  },
  customBadge: {
    backgroundColor: "#f44336",
    color: "#fff"
  },
  divider: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1)
  }
}));

const NotificationsVolume = ({
  volume,
  setVolume,
  silencedWhatsappIds = [],
  setSilencedWhatsappIds
}) => {
  const classes = useStyles();
  const { whatsApps } = useContext(WhatsAppsContext);

  const anchorEl = useRef();
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    setIsOpen(prevState => !prevState);
  };

  const handleClickAway = () => {
    setIsOpen(false);
  };

  const handleVolumeChange = value => {
    setVolume(value);
    localStorage.setItem("volume", value);
  };

  // marcar a conexao = ouvir o som dela. Guardamos as desmarcadas, entao
  // conexao nova entra tocando som, como era antes de existir esta opcao.
  const handleWhatsappToggle = (whatsappId, tocarSom) => {
    const novas = tocarSom
      ? silencedWhatsappIds.filter(id => id !== whatsappId)
      : [...silencedWhatsappIds, whatsappId];
    setSilencedWhatsappIds(novas);
    localStorage.setItem("silencedWhatsappIds", JSON.stringify(novas));
  };

  const handleAllToggle = tocarTodas => {
    const novas = tocarTodas ? [] : (whatsApps || []).map(w => w.id);
    setSilencedWhatsappIds(novas);
    localStorage.setItem("silencedWhatsappIds", JSON.stringify(novas));
  };

  const conexoes = whatsApps || [];

  return (
    <>
      <IconButton
        className={classes.icons}
        onClick={handleClick}
        ref={anchorEl}
        aria-label="Open Notifications"
        // color="inherit"
        // color="secondary"
      >
        <VolumeUpIcon color="inherit" />
      </IconButton>
      <Popover
        disableScrollLock
        open={isOpen}
        anchorEl={anchorEl.current}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        classes={{ paper: classes.popoverPaper }}
        onClose={handleClickAway}
      >
        <List dense className={classes.tabContainer}>
          <Grid container spacing={2}>
            <Grid item>
              <VolumeDownIcon />
            </Grid>
            <Grid item xs>
              <Slider
                value={volume}
                aria-labelledby="continuous-slider"
                step={0.1}
                min={0}
                max={1}
                onChange={(e, value) => handleVolumeChange(value)}
              />
            </Grid>
            <Grid item>
              <VolumeUpIcon />
            </Grid>
          </Grid>
          {conexoes.length > 1 && (
            <>
              <Divider className={classes.divider} />
              <Typography variant="subtitle2">
                {i18n.t("notifications.soundWhatsapps")}
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      color="primary"
                      checked={silencedWhatsappIds.length === 0}
                      onChange={e => handleAllToggle(e.target.checked)}
                    />
                  }
                  label={i18n.t("notifications.soundAllWhatsapps")}
                />
                {conexoes.map(whatsapp => (
                  <FormControlLabel
                    key={whatsapp.id}
                    control={
                      <Checkbox
                        size="small"
                        color="primary"
                        checked={!silencedWhatsappIds.includes(whatsapp.id)}
                        onChange={e =>
                          handleWhatsappToggle(whatsapp.id, e.target.checked)
                        }
                      />
                    }
                    label={whatsapp.name}
                  />
                ))}
              </FormGroup>
            </>
          )}
        </List>
      </Popover>
    </>
  );
};

export default NotificationsVolume;
