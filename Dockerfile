# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp -o /usr/local/bin/yt-dlp \
    && echo 'e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3  /usr/local/bin/yt-dlp' | sha256sum -c - \
    && chmod 755 /usr/local/bin/yt-dlp
ENV YTDLP_PATH=/usr/local/bin/yt-dlp FFMPEG_PATH=/usr/bin/ffmpeg

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
RUN node scripts/copy-embedded-sdk.js

RUN mkdir -p /app/data && chown -R node:node /app

USER node
RUN yt-dlp --version && ffmpeg -v error -f lavfi -i anullsrc -t 0.1 -c:a libopus -f opus - >/dev/null
ENV NODE_ENV=production
EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "src/main.js"]
