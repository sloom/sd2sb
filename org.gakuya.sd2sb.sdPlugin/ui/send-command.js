let websocket;
let uuid;
let actionInfo;
let settings = {};
let globalSettings = {};
let devices = [];
let deviceSource = "saved";

const defaults = {
  deviceName: "",
  deviceId: "",
  command: "turnOn",
  parameter: "default",
  commandType: "command",
  refreshDevicesAt: "",
  nextToggleCommand: "turnOn"
};

const actionFields = ["deviceId", "command", "parameter", "commandType"];
const globalFields = ["token", "secret"];
const fixedCommands = {
  "org.gakuya.sd2sb.turn-on": "turnOn",
  "org.gakuya.sd2sb.turn-off": "turnOff",
  "org.gakuya.sd2sb.toggle": "toggle"
};
const fixedCommandPages = {
  "turn-on.html": "turnOn",
  "turn-off.html": "turnOff",
  "toggle.html": "toggle"
};
const advancedRows = ["commandRow", "parameterRow", "commandTypeRow"];

window.connectElgatoStreamDeckSocket = (inPort, inUuid, inRegisterEvent, inInfo, inActionInfo) => {
  uuid = inUuid;
  actionInfo = JSON.parse(inActionInfo);
  settings = settingsWithActionDefault(actionInfo.payload?.settings ?? {});

  websocket = new WebSocket(`ws://127.0.0.1:${inPort}`);
  websocket.onopen = () => {
    websocket.send(JSON.stringify({ event: inRegisterEvent, uuid }));
    send("getGlobalSettings", uuid);
    loadSavedDevices();
    hydrate();
  };
  websocket.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (event.event === "didReceiveGlobalSettings") {
      globalSettings = event.payload?.settings ?? {};
      hydrate();
    }
    if (event.event === "didReceiveSettings") {
      settings = settingsWithActionDefault(event.payload?.settings ?? {});
      hydrate();
    }
    if (event.event === "sendToPropertyInspector" && event.payload?.event === "devices") {
      devices = event.payload.devices ?? [];
      deviceSource = "api";
      populateDevices(event.payload.error ?? "");
    }
  };
};

function hydrate() {
  const fixedCommand = getFixedCommand();
  if (fixedCommand) {
    settings.command = fixedCommand;
    setAdvancedRowsVisible(false);
  } else {
    setAdvancedRowsVisible(true);
  }

  for (const field of actionFields) {
    const element = document.getElementById(field);
    if (element) {
      element.value = settings[field] ?? defaults[field] ?? "";
    }
  }
  for (const field of globalFields) {
    const element = document.getElementById(field);
    element.value = globalSettings[field] ?? "";
  }
  renderDevicePicker();
}

function setAdvancedRowsVisible(visible) {
  for (const row of advancedRows) {
    const element = document.getElementById(row);
    if (element) {
      element.hidden = !visible;
    }
  }
}

function send(event, context, payload) {
  const message = { event, context };
  if (payload !== undefined) {
    message.payload = payload;
  }
  websocket?.send(JSON.stringify(message));
}

function saveActionSettings() {
  const fixedCommand = getFixedCommand();
  for (const field of actionFields) {
    const element = document.getElementById(field);
    if (element) {
      settings[field] = element.value.trim();
    }
  }
  if (fixedCommand) {
    settings.command = fixedCommand;
  }
  send("setSettings", uuid, settings);
}

function saveGlobalSettings() {
  for (const field of globalFields) {
    globalSettings[field] = document.getElementById(field).value.trim();
  }
  send("setGlobalSettings", uuid, globalSettings);
}

function settingsWithActionDefault(rawSettings) {
  const fixedCommand = getFixedCommand();
  return {
    ...defaults,
    ...rawSettings,
    command: fixedCommand || rawSettings.command || defaults.command
  };
}

function getFixedCommand() {
  const page = window.location.pathname.split("/").pop();
  return fixedCommands[actionInfo?.action] || fixedCommandPages[page];
}

async function loadSavedDevices() {
  const status = document.getElementById("deviceStatus");
  status.textContent = "Loading saved devices...";
  devices = Array.isArray(window.SD2SB_SAVED_DEVICES) ? window.SD2SB_SAVED_DEVICES : [];
  deviceSource = "saved";
  populateDevices("");
}

function requestDevices() {
  if (!globalSettings.token || !globalSettings.secret) {
    document.getElementById("deviceStatus").textContent = "Enter token and secret before refreshing devices";
    return;
  }
  document.getElementById("deviceStatus").textContent = "Loading devices...";
  sendToPlugin({ event: "refreshDevices" });
}

function sendToPlugin(payload) {
  websocket?.send(
    JSON.stringify({
      action: actionInfo.action,
      event: "sendToPlugin",
      context: uuid,
      payload
    })
  );
}

function populateDevices(error) {
  const options = document.getElementById("deviceOptions");
  options.innerHTML = "";
  appendDeviceOption("", "Manual device ID", "");

  for (const device of devices) {
    const suffix = device.deviceKind === "infrared" ? "IR" : "Device";
    appendDeviceOption(
      device.deviceId,
      `${device.deviceName} (${device.deviceType}, ${suffix})`,
      device.deviceName
    );
  }

  renderDevicePicker();
  const status = document.getElementById("deviceStatus");
  if (error) {
    status.textContent = `Could not load devices: ${error}`;
    return;
  }
  if (!devices.length) {
    status.textContent = deviceSource === "api" ? "No devices returned" : "No saved devices";
    return;
  }
  status.textContent = deviceSource === "api" ? `${devices.length} devices loaded` : `${devices.length} saved devices loaded`;
}

function appendDeviceOption(deviceId, label, deviceName) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "device-option";
  option.role = "option";
  option.dataset.id = deviceId;
  option.dataset.name = deviceName;
  option.textContent = label;
  option.title = label;
  option.setAttribute("aria-selected", deviceId === (settings.deviceId ?? "") ? "true" : "false");
  option.addEventListener("click", () => selectDevice(deviceId, deviceName));
  document.getElementById("deviceOptions").append(option);
}

function renderDevicePicker() {
  const button = document.getElementById("deviceSelect");
  const option = findSelectedDevice();
  const label = option ? `${option.deviceName} (${option.deviceType}, ${option.deviceKind === "infrared" ? "IR" : "Device"})` : "Manual device ID";
  button.textContent = label;
  button.title = label;

  for (const item of document.querySelectorAll(".device-option")) {
    item.setAttribute("aria-selected", item.dataset.id === (settings.deviceId ?? "") ? "true" : "false");
  }
}

function findSelectedDevice() {
  return devices.find((device) => device.deviceId === settings.deviceId);
}

function selectDevice(deviceId, deviceName) {
  settings.deviceId = deviceId;
  settings.deviceName = deviceName;
  document.getElementById("deviceId").value = deviceId;
  setDeviceMenuOpen(false);
  renderDevicePicker();
  saveActionSettings();
}

function toggleDeviceMenu() {
  const options = document.getElementById("deviceOptions");
  setDeviceMenuOpen(options.hidden);
}

function setDeviceMenuOpen(open) {
  document.getElementById("deviceOptions").hidden = !open;
  document.getElementById("deviceSelect").setAttribute("aria-expanded", open ? "true" : "false");
}

window.addEventListener("DOMContentLoaded", () => {
  for (const field of actionFields) {
    const element = document.getElementById(field);
    if (element) {
      element.addEventListener("change", saveActionSettings);
      element.addEventListener("input", saveActionSettings);
    }
  }
  for (const field of globalFields) {
    document.getElementById(field).addEventListener("change", saveGlobalSettings);
    document.getElementById(field).addEventListener("input", () => {
      saveGlobalSettings();
    });
  }
  document.getElementById("deviceSelect").addEventListener("click", toggleDeviceMenu);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".device-picker")) {
      setDeviceMenuOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setDeviceMenuOpen(false);
    }
  });
  document.getElementById("refreshDevices").addEventListener("click", requestDevices);
});
