# Imagen del frontend de Klassy: compila con Vite y sirve el resultado con nginx,
# que ademas reenvia /api al contenedor del backend (mismo dominio, sin CORS).

FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite incrusta esta URL al compilar. Relativa: el navegador llama al mismo dominio y nginx la reenvia.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine AS produccion
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilacion /app/dist /usr/share/nginx/html
EXPOSE 80
