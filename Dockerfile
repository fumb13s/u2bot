FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ src/

RUN chown -R node:node /app

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const h=require('http');const r=h.get('http://localhost:3000/healthz',s=>{process.exit(s.statusCode===200?0:1)});r.on('error',()=>process.exit(1))"

CMD ["node", "src/index.js"]
