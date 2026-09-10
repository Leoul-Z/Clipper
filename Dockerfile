# Use Node.js 20 Alpine as base image
FROM node:20-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code and config
COPY tsconfig.json ./
COPY src ./src/

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine

# Install OpenSSL for Prisma in the final stage too
RUN apk add --no-cache openssl

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expose port (if needed, mostly for webhooks, but we use polling here)
# EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Run migrations and start the bot
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && npm run start"]
