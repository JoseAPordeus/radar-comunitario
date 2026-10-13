FROM node:20-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/src packages/contracts/src

RUN npm install --workspace @radar-comunitario/api --workspace @radar-comunitario/contracts --include=dev --ignore-scripts

COPY apps/api apps/api

RUN npm run build --workspace @radar-comunitario/api

WORKDIR /app/apps/api
EXPOSE 4000

CMD ["npm", "start"]
