# iOS Simulator for OpenChamber

An [OpenChamber](https://openchamber.dev) extension that shows the iOS Simulator of the machine OpenChamber runs on as a live panel, and lets you use it: click to tap, drag to swipe, scroll, type, paste. A docked toolbar picks the device, boots and shuts it down, and has Home, Rotate, Light/Dark and Lock buttons. A Work Status section says which device runs and whether the stream is on.

It is built on [serve-sim](https://github.com/EvanBacon/serve-sim) and OpenChamber's shared surface, so the picture reaches every client OpenChamber serves (desktop app, browser, and the relay to a phone) without opening any extra port.

![iPhone in the panel, with the toolbar above and the status section below](docs/panel-iphone.png)

| iPad | Rotated | Dark |
|---|---|---|
| ![iPad mini](docs/panel-ipad.png) | ![Safari in landscape](docs/panel-landscape.png) | ![Dark appearance](docs/panel-dark.png) |

The screenshots come from the preview harness (`bun run preview`), which draws the surface the way OpenChamber does.

## Requirements

- macOS with Xcode and at least one iOS simulator runtime (`xcrun simctl list devices`).
- serve-sim 0.1.47 or newer on the PATH of the OpenChamber server: `npm install -g serve-sim`.
- OpenChamber 2.2.0 or newer (web server or desktop app; VS Code and mobile do not load extensions).

## Install

Settings > Extensions, then add this repository's Git URL (or a local clone's folder). The extension asks for one capability, a local **service** that runs these programs:

| Program | Why |
|---|---|
| `xcrun` | `simctl`: list, boot and shut down devices, appearance, keyboard layout, screenshots |
| `serve-sim` | the stream and the touch, key and button input |
| `sips` | rotates the picture when the device is in landscape (macOS built-in) |

As with every OpenChamber service, the list is shown for approval but does not sandbox the process; it runs with your user's access.

## How it works

```
OpenChamber surface (any client)  --frames/input-->  OpenChamber server
                                                        |  loopback, token
                                                        v
                                            extension service (127.0.0.1)
                                              |  MJPEG + HID WebSocket
                                              v
                                serve-sim helper on 127.0.0.1 only
                                              |
                                        iOS Simulator
```

- **Picture.** The service reads serve-sim's MJPEG stream from a helper bound to `127.0.0.1` and hands the newest frame to OpenChamber's surface (`GET /surface/frame`). Frames are pulled only while a viewer is open. With the device in landscape the frame is rotated with `sips`, about 30 ms per frame.
- **Helper.** The service reuses any serve-sim server already listening on loopback, or starts `serve-sim <udid> --port 31xx --host 127.0.0.1 --exit-on-simulator-shutdown` itself. It never binds anything to another interface, and it never touches a serve-sim preview server someone started on a LAN or Tailscale address (that server has a token-gated shell route).
- **Input.** Pointer, wheel and keys from the surface become serve-sim HID messages (touch begin/move/end, scroll, key usages), normalized to the portrait framebuffer. Characters are typed through a table for the simulator's hardware keyboard layout, read from its `AppleKeyboards` setting, so `@` arrives as `@` whatever your own keyboard layout is. German and US layouts are built in; other layouts are typed as US.
- **Devices.** The picker lists every available iPhone and iPad. Booting one shuts down any other running simulator first, so only one runs at a time. The last choice is remembered per OpenChamber instance.

### Service routes

All behind the host's token, on `127.0.0.1`:

| Route | |
|---|---|
| `GET /surface/frame`, `POST /surface/input`, `POST /surface/control`, `POST /surface/resize`, `GET /surface/clipboard` | OpenChamber shared surface |
| `GET /state` | devices, active device, stream, orientation, appearance, keyboard layout |
| `POST /boot` `{ udid }`, `POST /shutdown`, `POST /select` `{ udid }` | device lifecycle |
| `POST /button` `{ name: "home" \| "lock" }`, `POST /rotate`, `POST /appearance` | toolbar actions |
| `POST /tap` `{ x, y }` (0..1), `GET /screenshot`, `GET /ax` | tap, PNG screenshot (base64), accessibility tree |

## Limitations

- Copying from the simulator to your clipboard is not offered (`simctl pbpaste` is unreliable on recent Xcode), and pasting types the text key by key, so characters the keyboard layout has no key for (emoji, some accents) are skipped.
- Agents cannot call the extension yet: `contributes.tools` in OpenChamber 2.2 only changes how tool calls look. Agents keep using serve-sim or `xcrun simctl` directly.
- iPhone apps that do not support landscape (the Home Screen, Settings) appear sideways after Rotate, as they do in Simulator.app.

## Develop

```sh
bun install
bun run check        # typecheck, unit tests, build into dist/
node scripts/smoke.mjs                 # start the built service like OpenChamber does and read a real frame
SMOKE_TAP=0.5,0.5 node scripts/smoke.mjs
bun run preview                        # stand-in host on http://127.0.0.1:4790/<random>/
```

`dist/` is committed because OpenChamber serves built files and never compiles an extension.

## Deutsch

OpenChamber-Extension, die den iOS-Simulator der Maschine, auf der OpenChamber läuft, live im Panel zeigt und bedienbar macht (Tippen, Wischen, Scrollen, Tastatur, Einfügen). Die angedockte Leiste wählt das Gerät, startet und beendet es und hat Home, Drehen, Hell/Dunkel und Sperren. Der Statusabschnitt zeigt das laufende Gerät und ob der Stream an ist. Die Oberfläche ist auf Deutsch, wenn OpenChamber auf Deutsch läuft. Der Stream läuft über OpenChambers Surface-Mechanismus und funktioniert damit auch über das Relay; serve-sim wird nur an `127.0.0.1` gebunden.

## License

MIT
