FROM node:22-slim
WORKDIR /app
COPY package*.json ./
# User asked to use pnpm for everything
RUN npm install -g pnpm
RUN pnpm install --prod
COPY . .
EXPOSE 1234
VOLUME ["/app/data"]
CMD ["node", "server.js"]
