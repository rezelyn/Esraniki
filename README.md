# Esraniki

Esraniki is a Discord app offering a set of lighthearted features and games alongside a full-featured web dashboard that makes configuring every aspect of the app effortless.

## Requirements

- [Node.js® v24.18.0](https://nodejs.org/en/download)

## Quick start

```bash
git clone https://github.com/rezelyn/Esraniki.git
cd Esraniki
npm install
npm start
```

## Environement variables

###### Make a copy of `.env.exemple` and rename it `.env`

```bash
# APPLICATION CONFIGURATION
# The app token, used to authenticate with the Discord API
TOKEN=<your_app_token>
# The client ID and secret of your Discord application, used for the dashboard authentication
CLIENT_ID=<your_app_id>
CLIENT_SECRET=<your_app_secret>
# The redirect URI, should match the one set in your Discord application settings
# Replace the host with your server's IP or domain if not running locally
REDIRECT_URI=http://0.0.0.0:3000/auth/callback
DASHBOARD_PORT=3000

# DEVELOPMENT CONFIGURATION
# The guild ID to use for development, if a guild ID is set, commands will only be registered in that guild
# which allows for faster testing. If not set, commands will be registered globally, which can take up to an hour to update
GUILD_ID=<dev_guild_id>
# The owner ID, used to restrict access to certain commands or dashboard features to the app owner only, currently not supported
OWNER_ID=<owner_user_id>

# TWITCH INTEGRATION
# https://dev.twitch.tv/console/apps - Create an application to get these credentials, the redirect URI can be the same as the one used for Discord
# The client ID of your Twitch application, used for Twitch integration features
TWITCH_CLIENT_ID=<your_twitch_client_id>
# The client secret of your Twitch application, used for Twitch integration features
TWITCH_CLIENT_SECRET=<your_twitch_client_secret>

# YTDL INTEGRATION
# Helps avoid YouTube "HTTP Error 403: Forbidden" errors.
# If a cookies.txt file exists in the project root, it is used automatically
# Only set these to override that default
# Path to a Netscape-format cookies.txt file
COOKIES_FILE=<path_to_cookies_file>
# Read cookies directly from an installed browser instead
# Overrides COOKIES_FILE if both are set
COOKIES_FROM_BROWSER=<browser_name>[+<keyring>][:<profile_name>][::<container_name>]
# Comma-separated yt-dlp player clients to try, in order
# YouTube restricts playable formats for some clients, especially when using cookies
# If you get "Requested format is not available" errors, set this to force clients that don't require login
YTDL_PLAYER_CLIENTS=android_vr,web_embedded,mweb
```
