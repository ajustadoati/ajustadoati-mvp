FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY angular.json ./
COPY tsconfig*.json ./
COPY ionic.config.json ./
COPY capacitor.config.ts ./
COPY .browserslistrc ./
COPY src ./src

RUN npm run build -- --configuration production

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/www /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
