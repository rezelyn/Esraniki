# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
RUN node scripts/copy-embedded-sdk.js

RUN mkdir -p /app/data && chown -R node:node /app

USER node
ENV NODE_ENV=production
EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "src/main.js"]