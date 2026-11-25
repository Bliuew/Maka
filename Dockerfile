# Mäka API + web client. Node 22 + ffmpeg (video validation/transcoding).
# Data lives in PostgreSQL (DATABASE_URL) and media in S3-compatible storage (S3_*),
# so containers are stateless and can be replaced freely.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY web ./web
COPY docs ./docs
ENV PORT=8080 TRUST_PROXY=1
USER node
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
