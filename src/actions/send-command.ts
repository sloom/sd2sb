import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import {
  CommandSettings,
  GlobalSettings,
  listSwitchBotDevices,
  nextToggleCommand,
  normalizeCommandSettings,
  normalizeGlobalSettings,
  normalizeToggleCommand,
  sendSwitchBotCommand
} from "../switchbot/client.js";

const logger = streamDeck.logger.createScope("send-command");

abstract class CommandAction extends SingletonAction<CommandSettings> {
  readonly defaultCommand: string | undefined;

  protected constructor(defaultCommand: string | undefined = undefined) {
    super();
    this.defaultCommand = defaultCommand;
  }

  async onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> {
    const settings = this.settingsWithDefaultCommand(ev.payload.settings);
    await ev.action.setSettings(settings);
    await ev.action.setTitle(titleFor(settings));
  }

  async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CommandSettings>): Promise<void> {
    const settings = this.settingsWithDefaultCommand(ev.payload.settings);
    await ev.action.setTitle(titleFor(settings));
  }

  async onSendToPlugin(ev: SendToPluginEvent<JsonObject, CommandSettings>): Promise<void> {
    if (ev.payload?.event === "refreshDevices") {
      await this.sendDevicesToPropertyInspector(await ev.action.getSettings());
    }
  }

  async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
    const settings = this.settingsWithDefaultCommand(ev.payload.settings);
    const globalSettings = normalizeGlobalSettings(
      await streamDeck.settings.getGlobalSettings<GlobalSettings>()
    );
    const result = await sendSwitchBotCommand(globalSettings, settings);

    if (!result.sent) {
      logger.error("SwitchBot command missing required settings", {
        reason: result.reason
      });
      await ev.action.showAlert();
      return;
    }

    if (!result.response.ok || result.response.body.statusCode !== 100) {
      logger.error("SwitchBot command failed", {
        status: result.response.status,
        body: result.response.body
      });
      await ev.action.showAlert();
      return;
    }

    logger.info("SwitchBot command succeeded", {
      deviceId: settings.deviceId,
      command: settings.command,
      retried: result.retried
    });
    await ev.action.showOk();
  }

  settingsWithDefaultCommand(settings: Partial<CommandSettings>): CommandSettings {
    return normalizeCommandSettings({
      ...settings,
      command: this.defaultCommand || settings.command
    });
  }

  async sendDevicesToPropertyInspector(
    currentSettings: Partial<CommandSettings>
  ): Promise<void> {
    const globalSettings = normalizeGlobalSettings(
      await streamDeck.settings.getGlobalSettings<GlobalSettings>()
    );
    const result = await listSwitchBotDevices(globalSettings);

    if (!result.sent) {
      logger.error("SwitchBot device list missing required settings", {
        reason: result.reason
      });
      await streamDeck.ui.sendToPropertyInspector({
        event: "devices",
        error: result.reason,
        devices: [],
        settings: this.settingsWithDefaultCommand(currentSettings)
      });
      return;
    }

    logger.info("SwitchBot device list loaded", {
      status: result.response.status,
      statusCode: result.response.body.statusCode,
      message: result.response.body.message,
      deviceCount: result.response.devices.length
    });

    await streamDeck.ui.sendToPropertyInspector({
      event: "devices",
      error:
        result.response.ok && result.response.body.statusCode === 100
          ? ""
          : result.response.body.message,
      devices: result.response.devices,
      settings: this.settingsWithDefaultCommand(currentSettings)
    });
  }
}

@action({ UUID: "org.gakuya.sd2sb.send-command" })
export class SendCommand extends CommandAction {
  constructor() {
    super();
  }
}

@action({ UUID: "org.gakuya.sd2sb.turn-on" })
export class TurnOnCommand extends CommandAction {
  constructor() {
    super("turnOn");
  }
}

@action({ UUID: "org.gakuya.sd2sb.turn-off" })
export class TurnOffCommand extends CommandAction {
  constructor() {
    super("turnOff");
  }
}

@action({ UUID: "org.gakuya.sd2sb.toggle" })
export class ToggleCommand extends CommandAction {
  constructor() {
    super("toggle");
  }

  async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
    try {
      const currentSettings = normalizeCommandSettings(ev.payload.settings);
      const command = normalizeToggleCommand(currentSettings.nextToggleCommand);
      const settings = normalizeCommandSettings({
        ...currentSettings,
        command
      });

      const globalSettings = normalizeGlobalSettings(
        await streamDeck.settings.getGlobalSettings<GlobalSettings>()
      );
      const result = await sendSwitchBotCommand(globalSettings, settings);

      if (!result.sent) {
        logger.error("SwitchBot toggle missing required settings", {
          reason: result.reason
        });
        await ev.action.showAlert();
        return;
      }

      if (!result.response.ok || result.response.body.statusCode !== 100) {
        logger.error("SwitchBot toggle failed", {
          status: result.response.status,
          body: result.response.body,
          command: settings.command
        });
        await ev.action.showAlert();
        return;
      }

      logger.info("SwitchBot toggle succeeded", {
        deviceId: settings.deviceId,
        command: settings.command,
        retried: result.retried
      });
      await ev.action.setSettings({
        ...currentSettings,
        command: "toggle",
        nextToggleCommand: nextToggleCommand(command)
      });
      await ev.action.showOk();
    } catch (error) {
      logger.error("SwitchBot toggle threw", { error });
      await ev.action.showAlert();
    }
  }
}

function titleFor(settings: CommandSettings): string {
  const name = settings.deviceName || "SwitchBot";
  if (settings.command === "turnOn") {
    return `${name}\nON`;
  }
  if (settings.command === "turnOff") {
    return `${name}\nOFF`;
  }
  return `${name}\n${settings.command}`;
}
