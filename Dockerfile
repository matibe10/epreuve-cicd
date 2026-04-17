# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY src/package*.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

FROM node:20-alpine AS runtime
LABEL maintainer="DevSecOps Team <devsecops@example.com>" \
      version="1.0.0" \
      org.opencontainers.image.title="taskapi" \
      org.opencontainers.image.description="Secure Node.js Task API"

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node src/server.js src/package.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const req=http.get('http://127.0.0.1:3000/health',res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.setTimeout(3000,()=>{req.destroy();process.exit(1);});"

CMD ["node", "server.js"]
