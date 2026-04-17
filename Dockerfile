FROM nginx:1.27-alpine

RUN apk add --no-cache curl

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css app.js manifest.json sw.js icon-192.png icon-512.png /usr/share/nginx/html/

EXPOSE 80
