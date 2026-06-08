import streamDeck from "@elgato/streamdeck";

import { SendCommand, ToggleCommand, TurnOffCommand, TurnOnCommand } from "./actions/send-command.js";

streamDeck.actions.registerAction(new SendCommand());
streamDeck.actions.registerAction(new TurnOnCommand());
streamDeck.actions.registerAction(new TurnOffCommand());
streamDeck.actions.registerAction(new ToggleCommand());
streamDeck.connect();
