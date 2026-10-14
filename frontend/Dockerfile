FROM node:22-alpine

WORKDIR /app

# Las dependencias se instalan en la imagen; docker-compose monta el código
# encima pero conserva node_modules en un volumen propio del contenedor.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
