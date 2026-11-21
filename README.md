# Esraniki

Esraniki is a Discord app offering a set of lighthearted features and games alongside a full-featured web dashboard that makes configuring every aspect of the app effortless.

## Features

- **Statistics Tracking**<br>
  Per-server message and voice-time leaderboards, with per-user breakdowns and rank and periodic sorting.
- **Server Rules Embeds**<br>
  A configurable, multi-section rules embed that's posted to a channel and kept in sync from the dashboard.
- **Twitch announcements**<br>
  Automatically posts a message in a channel whenever a configured Twitch streamer goes live.
- **YouTube Player**<br>
  Join a voice channel and control it in the web dashboard or Discord Activity. Search for a video, paste a YouTube link, or use `/play` in Discord. Everyone listening in the bot's channel shares the queue and playback controls.
- **Minecraft server tracking**
  Posts and auto-refreshes a live status embed of a Minecraft server, tracking connected players, players count, Minecraft version and server status.
- **Games**
  - Pass The Shrimp Down<br>
    A social mini-game where members pass a designated GIF around a channel, with a total/daily leaderboard.
- **Multilingual**<br>
  English and French out of the box, easy to extend with additional locales files, currently limited to the Discord app itself, dashboard is unaffected.
- **Web dashboard**<br>
  Configure every feature above, per-server.
- **Discord Activities support** (WIP)<br>
  The dashboard can also be launched as an embedded Activity from a Discord voice channel.

## Requirements

- For **[Manual](#manual-setup)** setup: [Node.js 24.18+](https://nodejs.org/en/download)
- For **[Docker](#docker-setup)** setup: [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

You'll *also* need a [Discord application](https://discord.com/developers/applications) to run the bot and dashboard, duh.

### 1. Clone the repository

```bash
git clone https://github.com/rezelyn/Esraniki.git
cd Esraniki
```

### 2. Configure your environment

Make a copy of `.env.exemple` and rename it `.env`, then fill in the values described in [Environment variables](#environment-variables) below.

```bash
cp .env.exemple .env
```

### 3. Setup

Choose one of the two setups below, either [Manual](#manual-setup) or [Docker](#docker-setup).

#### Manual Setup

```bash
npm install
npm start
```
- The player uses the yt-dlp and FFmpeg binaries installed by the npm dependencies. If your package manager skips install scripts, run `npm rebuild youtube-dl-exec ffmpeg-static` or point `YTDLP_PATH` and `FFMPEG_PATH` at working binaries. The Docker image includes both tools.

For development environement:

```bash
npm run dev
```

> This requires you to create a new environement file named `.env.dev` and `GUILD_ID` to be set in.

#### Docker Setup

A `Dockerfile` and `docker-compose.yml` are included.<br>
The container installs dependencies, runs `npm install` and the same `postinstall` copy step as the manual setup, and runs `node src/main.js` on start.

##### Using Docker Compose (recommended)

```bash
docker compose up -d --build
```

This builds the image, starts the container in the background, loads variables from your `.env` file, exposes the dashboard on `DASHBOARD_PORT` (`3000` by default), and persists per-guild data to a `./data` folder on the host via a bind mount.

Here's some useful docker commands:

```bash
docker compose logs -f      # follow logs
docker compose restart      # restart after an .env change
docker compose down         # stop and remove the container
```

---

##### Using Docker Directly (why?)

```bash
docker build -t esraniki .
docker run -d \
  --name esraniki \
  --env-file .env \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  esraniki
```

Replace `3000` with your `DASHBOARD_PORT` if you changed it, on both sides of `-p`

##### Notes

- If you're running the dashboard behind a reverse proxy (like with nginx), make sure `REDIRECT_URI` points at the public-facing URL/port, not the container's internal one.
- Per-guild JSON data lives in `/app/data` inside the container, the `./data` bind mount (or a named volume) is what makes it survive rebuilds so don't skip it.
- To supply optional YouTube cookies, mount a Netscape cookie file read-only, for example `/path/on/host/youtube.cookies.txt:/run/secrets/youtube.cookies.txt:ro`, and set `COOKIES_FILE=/run/secrets/youtube.cookies.txt`.

## Environment Variables

#### Application

| Variable         | Required | Description                                                                                                                                               |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOKEN`          | Yes      | Your Discord app's bot token, used to authenticate with the Discord API.                                                                                  |
| `CLIENT_ID`      | Yes      | Your Discord application's client ID, used for dashboard OAuth2 login.                                                                                    |
| `CLIENT_SECRET`  | Yes      | Your Discord application's client secret, used for dashboard OAuth2 login.                                                                                |
| `REDIRECT_URI`   | Yes      | OAuth2 redirect URI. Must match the one set in your Discord application's settings. Replace the host with your server's IP/domain if not running locally. |
| `DASHBOARD_PORT` | Yes      | Port the dashboard listens on. Should match the port used in `REDIRECT_URI`.                                                                              |

#### Development

| Variable   | Required | Description                                                                                                                                                                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GUILD_ID` | No       | If set, commands are cleared and registered only to the set guild ID for fast iteration (used with `npm run dev`). If unset, commands register globally, which can take up to an hour to propagate. Ignored in production mode. |
| `OWNER_ID` | No       | Intended to restrict certain commands/dashboard features to the app owner. Not currently used in the application by default.                                                                                                    |

#### Twitch Integration

Create an application at [Twitch Developer](https://dev.twitch.tv/console/apps) to get these, the redirect URI can be the same one used for Discord.

| Variable               | Required | Description                                                               |
| ---------------------- | -------- | ------------------------------------------------------------------------- |
| `TWITCH_CLIENT_ID`     | No       | Twitch application client ID. Twitch announcements are disabled if unset. |
| `TWITCH_CLIENT_SECRET` | No       | Twitch application client secret.                                         |

#### YTDL Integration

| Variable               | Required | Description                                                                                                                                                                                                                                                                                |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `YTDLP_PATH`           | No       | Path to an official yt-dlp executable with its bundled JavaScript components.                                                                                                                                                                                                              |
| `FFMPEG_PATH`          | No       | Path to an FFmpeg executable with the libopus encoder.                                                                                                                                                                                                                                     |
| `COOKIES_FILE`         | No       | Path to a Netscape-format `cookies.txt` file, helps avoid YouTube "HTTP Error 403" errors. If a `cookies.txt` file exists in the project root, it's used automatically. Only set this to override that default.                                                                           |
| `COOKIES_FROM_BROWSER` | No       | Read cookies directly from an installed browser instead, in the form `<browser_name>[+<keyring>][:<profile_name>][::<container_name>]`. Overrides `COOKIES_FILE` if both are set.                                                                                                          |
| `YTDL_PLAYER_CLIENTS`  | No       | Comma-separated yt-dlp player clients to try, in order (e.g. `android_vr,web_embedded,mweb`). YouTube restricts playable formats for some clients, especially with cookies set; if you hit "Requested format is not available" errors, set this to force clients that don't require login. |
