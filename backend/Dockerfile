FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# swagger.yaml and other non-JS assets are copied above via `COPY . .`
EXPOSE 5000

CMD ["node", "server.js"]
