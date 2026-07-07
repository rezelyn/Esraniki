# Esraniki

A Discord bot with a web dashboard, built with discord.js.

## Stack
- Runtime: Node.js (CommonJS)
- Discord: discord.js v14
- Dashboard: built-in HTTP server (no framework)

## How to run
The workflow `Start application` runs `npm start` (`node src/main.js`). The bot and dashboard start together; the dashboard is served on port 3000.

## Required secrets (set in Replit Secrets)
| Key | Description |
|-----|-------------|
| `TOKEN` | Discord bot token |
| `CLIENT_ID` | Discord application client ID |
| `CLIENT_SECRET` | Discord application client secret |
| `GUILD_ID` | (optional) Guild ID for instant dev command registration |
| `TWITCH_CLIENT_ID` | (optional) Twitch app client ID |
| `TWITCH_CLIENT_SECRET` | (optional) Twitch app client secret |

## Required env vars (set in Replit environment)
| Key | Value |
|-----|-------|
| `DASHBOARD_PORT` | `3000` |
| `REDIRECT_URI` | `https://<your-replit-dev-domain>/auth/callback` |

## Notes
- `REDIRECT_URI` must also be added to your Discord application's OAuth2 redirect URIs in the Discord Developer Portal.
- Without `GUILD_ID`, slash commands register globally — this can take up to 1 hour to propagate. Set `GUILD_ID` to your dev server's ID for instant registration during development.

## User preferences
