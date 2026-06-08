import { createHmac, randomUUID } from "node:crypto";

export interface CommandSettings {
  [key: string]: string;
  deviceId: string;
  deviceName: string;
  command: string;
  parameter: string;
  commandType: string;
  refreshDevicesAt: string;
  nextToggleCommand: string;
}

export interface GlobalSettings {
  [key: string]: string;
  token: string;
  secret: string;
}

export interface SwitchBotResponseBody {
  statusCode: number;
  message: string;
  body?: unknown;
}

export interface SwitchBotCommandResponse {
  ok: boolean;
  status: number;
  body: SwitchBotResponseBody;
}

export interface DeviceOption {
  [key: string]: string;
  deviceId: string;
  deviceName: string;
  deviceKind: "physical" | "infrared";
  deviceType: string;
}

export interface SwitchBotDevicesBody {
  deviceList?: Array<{
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
  }>;
  infraredRemoteList?: Array<{
    deviceId?: string;
    deviceName?: string;
    remoteType?: string;
  }>;
}

export interface SwitchBotDevicesResponse {
  ok: boolean;
  status: number;
  body: SwitchBotResponseBody & {
    body?: SwitchBotDevicesBody;
  };
  devices: DeviceOption[];
}

export interface SendOptions {
  now?: () => number;
  nonce?: () => string;
  fetch?: typeof fetch;
  uppercaseSign?: boolean;
}

export type CommandExecutionResult =
  | {
      sent: false;
      reason: "missing-token" | "missing-secret" | "missing-device-id";
    }
  | {
      sent: true;
      retried: boolean;
      response: SwitchBotCommandResponse;
    };

const API_BASE_URL = "https://api.switch-bot.com/v1.1";

export function normalizeCommandSettings(settings: Partial<CommandSettings> = {}): CommandSettings {
  return {
    deviceId: settings.deviceId?.trim() ?? "",
    deviceName: settings.deviceName?.trim() ?? "",
    command: settings.command?.trim() || "turnOn",
    parameter: settings.parameter?.trim() || "default",
    commandType: settings.commandType?.trim() || "command",
    refreshDevicesAt: settings.refreshDevicesAt?.trim() ?? "",
    nextToggleCommand: normalizeToggleCommand(settings.nextToggleCommand)
  };
}

export function normalizeGlobalSettings(settings: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    token: settings.token?.trim() ?? "",
    secret: settings.secret?.trim() ?? ""
  };
}

export function createSwitchBotSign(args: {
  token: string;
  secret: string;
  timestamp: number;
  nonce: string;
  uppercase?: boolean;
}): string {
  const data = `${args.token}${args.timestamp}${args.nonce}`;
  const sign = createHmac("sha256", args.secret).update(data).digest("base64");
  return args.uppercase ? sign.toUpperCase() : sign;
}

export function buildCommandRequest(
  globalSettings: GlobalSettings,
  commandSettings: CommandSettings,
  options: SendOptions = {}
): Request {
  const timestamp = options.now?.() ?? Date.now();
  const nonce = options.nonce?.() ?? randomUUID();
  const sign = createSwitchBotSign({
    token: globalSettings.token,
    secret: globalSettings.secret,
    timestamp,
    nonce,
    uppercase: options.uppercaseSign
  });

  return new Request(`${API_BASE_URL}/devices/${encodeURIComponent(commandSettings.deviceId)}/commands`, {
    method: "POST",
    headers: {
      Authorization: globalSettings.token,
      sign,
      nonce,
      t: String(timestamp),
      "Content-Type": "application/json; charset=utf8"
    },
    body: JSON.stringify({
      command: commandSettings.command,
      parameter: commandSettings.parameter,
      commandType: commandSettings.commandType
    })
  });
}

export function buildDevicesRequest(
  globalSettings: GlobalSettings,
  options: SendOptions = {}
): Request {
  const timestamp = options.now?.() ?? Date.now();
  const nonce = options.nonce?.() ?? randomUUID();
  const sign = createSwitchBotSign({
    token: globalSettings.token,
    secret: globalSettings.secret,
    timestamp,
    nonce,
    uppercase: options.uppercaseSign
  });

  return new Request(`${API_BASE_URL}/devices`, {
    method: "GET",
    headers: {
      Authorization: globalSettings.token,
      sign,
      nonce,
      t: String(timestamp),
      "Content-Type": "application/json; charset=utf8"
    }
  });
}

export class SwitchBotClient {
  readonly #globalSettings: GlobalSettings;

  constructor(globalSettings: GlobalSettings) {
    this.#globalSettings = normalizeGlobalSettings(globalSettings);
  }

  async sendCommand(
    settings: CommandSettings,
    options: SendOptions = {}
  ): Promise<SwitchBotCommandResponse> {
    const fetchImpl = options.fetch ?? fetch;
    const request = buildCommandRequest(this.#globalSettings, normalizeCommandSettings(settings), options);
    const response = await fetchImpl(request);
    const body = await parseResponseBody(response);

    return {
      ok: response.ok,
      status: response.status,
      body
    };
  }

  async listDevices(options: SendOptions = {}): Promise<SwitchBotDevicesResponse> {
    const fetchImpl = options.fetch ?? fetch;
    const request = buildDevicesRequest(this.#globalSettings, options);
    const response = await fetchImpl(request);
    const body = (await parseResponseBody(response)) as SwitchBotResponseBody & {
      body?: SwitchBotDevicesBody;
    };

    return {
      ok: response.ok,
      status: response.status,
      body,
      devices: deviceOptionsFromBody(body.body as SwitchBotDevicesBody | undefined)
    };
  }
}

export async function listSwitchBotDevices(
  globalSettings: Partial<GlobalSettings>,
  options: SendOptions = {}
): Promise<
  | {
      sent: false;
      reason: "missing-token" | "missing-secret";
    }
  | {
      sent: true;
      response: SwitchBotDevicesResponse;
    }
> {
  const normalizedGlobalSettings = normalizeGlobalSettings(globalSettings);

  if (!normalizedGlobalSettings.token) {
    return { sent: false, reason: "missing-token" };
  }
  if (!normalizedGlobalSettings.secret) {
    return { sent: false, reason: "missing-secret" };
  }

  const client = new SwitchBotClient(normalizedGlobalSettings);
  let response = await client.listDevices(options);

  if (isAuthError(response)) {
    response = await client.listDevices({ ...options, uppercaseSign: true });
  }

  return { sent: true, response };
}

export async function sendSwitchBotCommand(
  globalSettings: Partial<GlobalSettings>,
  commandSettings: Partial<CommandSettings>,
  options: SendOptions = {}
): Promise<CommandExecutionResult> {
  const normalizedGlobalSettings = normalizeGlobalSettings(globalSettings);
  const normalizedCommandSettings = normalizeCommandSettings(commandSettings);

  if (!normalizedGlobalSettings.token) {
    return { sent: false, reason: "missing-token" };
  }
  if (!normalizedGlobalSettings.secret) {
    return { sent: false, reason: "missing-secret" };
  }
  if (!normalizedCommandSettings.deviceId) {
    return { sent: false, reason: "missing-device-id" };
  }

  const client = new SwitchBotClient(normalizedGlobalSettings);
  const response = await client.sendCommand(normalizedCommandSettings, options);

  if (!isAuthError(response)) {
    return { sent: true, retried: false, response };
  }

  const retryResponse = await client.sendCommand(normalizedCommandSettings, {
    ...options,
    uppercaseSign: true
  });

  return { sent: true, retried: true, response: retryResponse };
}

export function isAuthError(response: SwitchBotCommandResponse): boolean {
  return response.status === 401 || response.status === 403 || response.body.statusCode === 190;
}

export function normalizeToggleCommand(command: string | undefined): "turnOn" | "turnOff" {
  return command === "turnOff" ? "turnOff" : "turnOn";
}

export function nextToggleCommand(command: string | undefined): "turnOn" | "turnOff" {
  return normalizeToggleCommand(command) === "turnOn" ? "turnOff" : "turnOn";
}

async function parseResponseBody(response: Response): Promise<SwitchBotResponseBody> {
  try {
    const body = (await response.json()) as Partial<SwitchBotResponseBody>;
    return {
      statusCode: Number(body.statusCode ?? response.status),
      message: String(body.message ?? response.statusText),
      body: body.body
    };
  } catch {
    return {
      statusCode: response.status,
      message: response.statusText
    };
  }
}

function deviceOptionsFromBody(body: SwitchBotDevicesBody | undefined): DeviceOption[] {
  const physicalDevices =
    body?.deviceList?.flatMap((device) => {
      if (!device.deviceId || !device.deviceName) {
        return [];
      }
      return [
        {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          deviceKind: "physical" as const,
          deviceType: device.deviceType ?? "Unknown"
        }
      ];
    }) ?? [];

  const infraredDevices =
    body?.infraredRemoteList?.flatMap((device) => {
      if (!device.deviceId || !device.deviceName) {
        return [];
      }
      return [
        {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          deviceKind: "infrared" as const,
          deviceType: device.remoteType ?? "Unknown"
        }
      ];
    }) ?? [];

  return [...physicalDevices, ...infraredDevices].sort((a, b) =>
    a.deviceName.localeCompare(b.deviceName, "ja")
  );
}
