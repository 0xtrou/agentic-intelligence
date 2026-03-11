# ========== Build Stage ==========
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./

# Copy all packages
COPY packages ./packages

# Install ALL dependencies (including devDependencies for build)
RUN NODE_ENV=development pnpm install --frozen-lockfile

# Build all packages
RUN pnpm build

# ========== Production Stage ==========
FROM node:22-alpine AS runner

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Build version injected at docker build time
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION}

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules

# Expose API port
EXPOSE 3000

# Start the API
CMD ["node", "packages/api/dist/main.js"]
