FROM node:22-alpine

WORKDIR /app

# Las dependencias se instalan en la imagen; docker-compose monta el código
# encima pero conserva node_modules en un volumen propio del contenedor.
COPY package.json package-lock.json ./
RUN npm ci \
    && sha256sum package-lock.json | cut -d' ' -f1 > node_modules/.huella-package-lock

COPY . .

EXPOSE 5173

# Al iniciar, reinstala las dependencias si package-lock.json cambió.
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]
