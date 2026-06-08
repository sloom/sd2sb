# sd2sb

Stream Deck plugin for sending SwitchBot API v1.1 commands.

## Requirements

- Node.js 24 or later
- Stream Deck 7.1 or later

## Development

```powershell
npm install
npm run build
npm test
npm run lint
npm run validate
npx streamdeck pack org.gakuya.sd2sb.sdPlugin
```

The packaged plugin is written to:

```text
org.gakuya.sd2sb.streamDeckPlugin
```

## Stream Deck Setup

1. Install or link the plugin.
2. Add one of the `sd2sb` actions to a key.
3. In the property inspector, enter the SwitchBot token and secret once per computer.
4. Use `Turn On`, `Turn Off`, or `Toggle` for fixed ON/OFF keys.
5. Use `Send Command` for advanced commands. For SwitchBot infrared custom buttons, set `commandType` to `customize` and set `command` to the button name from the SwitchBot app.

Example ON command:

```json
{
  "deviceId": "<your-device-id>",
  "command": "turnOn",
  "parameter": "default",
  "commandType": "command"
}
```

Example OFF command:

```json
{
  "deviceId": "<your-device-id>",
  "command": "turnOff",
  "parameter": "default",
  "commandType": "command"
}
```

Secrets are stored in Stream Deck global plugin settings, not in this repository.
