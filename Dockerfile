# Stage 1: Build da aplicação React/Vite
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime de Produção (Node.js nativo leve)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production --ignore-scripts
COPY --from=build /app/dist ./dist
COPY server.js ./
COPY README.md ./

# Diretório de uploads e definição de Volume Persistente para sobreviver a deploys
RUN mkdir -p uploads && chmod 777 uploads
VOLUME ["/app/uploads"]

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
