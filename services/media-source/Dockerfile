FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server.mjs worker.ts ./
USER node
ENV HOST=0.0.0.0 PORT=8787 MEDIA_ASSETS_DIR=/media MEDIA_TOKEN_FILE=/run/secrets/media_token
EXPOSE 8787
CMD ["node", "server.mjs"]
