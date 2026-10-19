FROM nginx:1.27-alpine

# Clean default content
RUN rm -rf /usr/share/nginx/html/* \
 && rm -f /etc/nginx/conf.d/default.conf

# Copy config & static site
COPY nginx.conf /etc/nginx/conf.d/oilwatch.conf
COPY html/ /usr/share/nginx/html/

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]