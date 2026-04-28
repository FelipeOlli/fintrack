# Build FinTrack (Vite + React)
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Placeholder — valor real vem do EasyPanel em runtime via nginx proxy
ENV VITE_API_URL=/api
RUN npm run build

# Servir SPA estática
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
