# syntax=docker/dockerfile:1
# Build from repository root: docker build -f docker/Dockerfile.frontend -t to5-frontend .

FROM node:20-alpine AS builder
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

ARG VITE_MAPBOX_ACCESS_TOKEN
ARG VITE_MAPBOX_STYLE_URL
ARG VITE_API_URL

ENV VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN \
    VITE_MAPBOX_STYLE_URL=$VITE_MAPBOX_STYLE_URL \
    VITE_API_URL=$VITE_API_URL

RUN test -n "$VITE_MAPBOX_ACCESS_TOKEN" && test -n "$VITE_MAPBOX_STYLE_URL" || (echo "Missing VITE_MAPBOX_* build args; see docker/.env" && exit 1)

RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine

COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx docker/frontend-nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
