FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

RUN mkdir -p /app/data && chown node:node /app/data

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080', { headers: { 'x-forwarded-proto': 'https' } }).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "index.js"]
