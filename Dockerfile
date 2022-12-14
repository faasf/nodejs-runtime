FROM node:14-alpine

RUN mkdir -p /app
WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm ci

ADD src ./src/

CMD ["npm", "run", "start"]