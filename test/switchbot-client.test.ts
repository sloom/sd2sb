import { describe, expect, it, vi } from "vitest";

import {
  SwitchBotClient,
  buildDevicesRequest,
  buildCommandRequest,
  createSwitchBotSign,
  isAuthError,
  nextToggleCommand,
  normalizeCommandSettings,
  normalizeToggleCommand,
  sendSwitchBotCommand
} from "../src/switchbot/client.js";

const globalSettings = {
  token: "test-token",
  secret: "test-secret"
};

const commandSettings = {
  deviceId: "02-202501010000-00000000",
  deviceName: "Test Device",
  command: "turnOn",
  parameter: "default",
  commandType: "command",
  refreshDevicesAt: "",
  nextToggleCommand: "turnOn"
};

describe("SwitchBot client", () => {
  it("creates a stable v1.1 signature", () => {
    expect(
      createSwitchBotSign({
        token: "test-token",
        secret: "test-secret",
        timestamp: 1710000000000,
        nonce: "nonce-123"
      })
    ).toBe("kWCjDXXH6xDI0FrYCQC2vrTAjJi+WvBIfGJlYUdvNtU=");
  });

  it("builds a turnOn command request", async () => {
    const request = buildCommandRequest(globalSettings, commandSettings, {
      now: () => 1710000000000,
      nonce: () => "nonce-123"
    });

    expect(request.url).toBe(
      "https://api.switch-bot.com/v1.1/devices/02-202501010000-00000000/commands"
    );
    expect(request.method).toBe("POST");
    expect(request.headers.get("Authorization")).toBe("test-token");
    expect(request.headers.get("nonce")).toBe("nonce-123");
    expect(request.headers.get("t")).toBe("1710000000000");
    expect(request.headers.get("Content-Type")).toBe("application/json; charset=utf8");
    await expect(request.json()).resolves.toEqual({
      command: "turnOn",
      parameter: "default",
      commandType: "command"
    });
  });

  it("builds a turnOff command request", async () => {
    const request = buildCommandRequest(
      globalSettings,
      { ...commandSettings, command: "turnOff" },
      {
        now: () => 1710000000000,
        nonce: () => "nonce-123"
      }
    );

    await expect(request.json()).resolves.toMatchObject({
      command: "turnOff"
    });
  });

  it("tracks the next toggle command in settings", () => {
    expect(normalizeToggleCommand(undefined)).toBe("turnOn");
    expect(normalizeToggleCommand("turnOn")).toBe("turnOn");
    expect(normalizeToggleCommand("turnOff")).toBe("turnOff");
    expect(nextToggleCommand("turnOn")).toBe("turnOff");
    expect(nextToggleCommand("turnOff")).toBe("turnOn");
    expect(normalizeCommandSettings({ nextToggleCommand: "turnOff" }).nextToggleCommand).toBe("turnOff");
  });

  it("builds a signed devices request", () => {
    const request = buildDevicesRequest(globalSettings, {
      now: () => 1710000000000,
      nonce: () => "nonce-123"
    });

    expect(request.url).toBe("https://api.switch-bot.com/v1.1/devices");
    expect(request.method).toBe("GET");
    expect(request.headers.get("Authorization")).toBe("test-token");
    expect(request.headers.get("nonce")).toBe("nonce-123");
  });

  it("lists physical and infrared devices without filtering", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        statusCode: 100,
        message: "success",
        body: {
          deviceList: [
            {
              deviceId: "physical-1",
              deviceName: "Hub",
              deviceType: "Hub Mini"
            }
          ],
          infraredRemoteList: [
            {
              deviceId: "02-202501010000-00000000",
              deviceName: "Example TV",
              remoteType: "DIY TV"
            }
          ]
        }
      })
    );
    const client = new SwitchBotClient(globalSettings);

    const response = await client.listDevices({
      fetch: fetchMock,
      now: () => 1710000000000,
      nonce: () => "nonce-123"
    });

    expect(response.devices).toEqual([
      {
        deviceId: "02-202501010000-00000000",
        deviceName: "Example TV",
        deviceKind: "infrared",
        deviceType: "DIY TV"
      },
      {
        deviceId: "physical-1",
        deviceName: "Hub",
        deviceKind: "physical",
        deviceType: "Hub Mini"
      }
    ]);
  });

  it("does not fetch when required settings are missing", async () => {
    const fetchMock = vi.fn();

    await expect(
      sendSwitchBotCommand(globalSettings, { ...commandSettings, deviceId: "" }, { fetch: fetchMock })
    ).resolves.toEqual({ sent: false, reason: "missing-device-id" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("identifies auth errors", () => {
    expect(isAuthError({ ok: false, status: 401, body: { statusCode: 401, message: "unauthorized" } })).toBe(
      true
    );
    expect(isAuthError({ ok: true, status: 200, body: { statusCode: 190, message: "bad sign" } })).toBe(
      true
    );
    expect(isAuthError({ ok: true, status: 200, body: { statusCode: 100, message: "success" } })).toBe(
      false
    );
  });

  it("allows an uppercase signature retry after an auth error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ statusCode: 190, message: "bad sign" }))
      .mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success" }));
    const client = new SwitchBotClient(globalSettings);

    const first = await client.sendCommand(commandSettings, {
      fetch: fetchMock,
      now: () => 1710000000000,
      nonce: () => "nonce-123"
    });
    const second = isAuthError(first)
      ? await client.sendCommand(commandSettings, {
          fetch: fetchMock,
          now: () => 1710000000000,
          nonce: () => "nonce-123",
          uppercaseSign: true
        })
      : first;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.body.statusCode).toBe(190);
    expect(second.body.statusCode).toBe(100);
    const firstRequest = fetchMock.mock.calls[0][0] as Request;
    const secondRequest = fetchMock.mock.calls[1][0] as Request;
    expect(secondRequest.headers.get("sign")).toBe(firstRequest.headers.get("sign")?.toUpperCase());
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
