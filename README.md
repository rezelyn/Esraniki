# Esraniki

Esraniki is a Discord bot initially developed for a private server among friends, offering a set of lighthearted features alongside a full-featured web dashboard that makes configuring every aspect of the bot effortless.

## Requirements

- Node.js >=18

## Setup

1. Clone repository:
```bash
git clone https://github.com/rezelyn/Esraniki.git
cd Esraniki
```

2. Install dependencies:
```bash
npm install
```
3. Setup environement variables:
```bash
# APPLICATION CONFIGURATION
# The bot token, used to authenticate with the Discord API
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
# which allows for faster testing. If not set, commands will be registered globally, which can take up to an hour to update.
GUILD_ID=<dev_guild_id>
# The owner ID, used to restrict access to certain commands or dashboard features to the bot owner only, currently not supported.
OWNER_ID=<owner_user_id>
```
###### Make a copy of `.env.exemple` and rename it `.env`

4. Run the bot:
```bash
npm start
```