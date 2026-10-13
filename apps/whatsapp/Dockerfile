FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/whatsapp/package.json apps/whatsapp/package.json
COPY packages/contracts packages/contracts

RUN npm install --workspace @radar-comunitario/whatsapp-agent --workspace @radar-comunitario/contracts --include=dev --ignore-scripts

COPY apps/whatsapp apps/whatsapp

WORKDIR /app/apps/whatsapp
RUN npm run build

ENV WHATSAPP_SESSION_PATH=/app/.wwebjs_auth
VOLUME ["/app/.wwebjs_auth"]

CMD ["npm", "start"]
