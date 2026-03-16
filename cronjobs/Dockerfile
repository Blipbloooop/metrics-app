FROM node:20-alpine

WORKDIR /app

# Copier les dépendances
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copier le code nécessaire
COPY cronjobs/scraper.ts ./cronjobs/
COPY app/services/prometheus-collector.ts ./app/services/
COPY app/types/metrics.ts ./app/types/
COPY tsconfig.json ./

# Installer tsx pour exécuter TypeScript directement
RUN npm install -g tsx

CMD ["tsx", "cronjobs/scraper.ts"]