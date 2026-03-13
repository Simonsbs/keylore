FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.title="KeyLore" \
      org.opencontainers.image.description="MCP credential broker and searchable credential catalogue for LLM coding tools." \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/Simonsbs/keylore"
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY --from=build /app/migrations ./migrations
EXPOSE 8787
CMD ["node", "dist/index.js", "--transport", "http"]
