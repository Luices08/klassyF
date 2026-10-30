# Imagen del backend de Klassy. Etapas:
#   produccion   -> la API compilada (node dist/server.js), la que corre en el VPS.
#   herramientas -> codigo fuente + tsx para correr seeds y migraciones (npm run seed, etc.).

FROM node:22-alpine AS dependencias
WORKDIR /app
# mongodb-memory-server (solo pruebas) no debe descargar el binario de MongoDB al construir.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencias AS compilacion
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM dependencias AS herramientas
ENV NODE_ENV=production
COPY tsconfig.json tsconfig.scripts.json ./
COPY src ./src
COPY scripts ./scripts
CMD ["npm", "run", "seed"]

FROM node:22-alpine AS produccion
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=compilacion /app/dist ./dist
# Los archivos subidos se guardan en <cwd>/uploads: en compose es un volumen.
RUN mkdir -p uploads && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health > /dev/null || exit 1
CMD ["node", "dist/server.js"]
