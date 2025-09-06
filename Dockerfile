FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install dependencies (production only for smaller image)
RUN pnpm install --frozen-lockfile --prod

# Install dev dependencies temporarily for build
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Remove dev dependencies after build
RUN pnpm prune --prod

# Copy job runner after build
COPY src/job-runner.ts .mastra/output/job-runner.mjs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mastra -u 1001

# Create entry point script
RUN echo '#!/bin/sh\n\
PORT=${PORT:-8080}\n\
if [ "$MODE" = "job" ]; then\n\
  echo "🚀 Starting in Job mode..."\n\
  node .mastra/output/job-runner.mjs\n\
else\n\
  echo "🌐 Starting in Service mode on port $PORT..."\n\
  node --import=./.mastra/output/instrumentation.mjs .mastra/output/index.mjs\n\
fi' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Change ownership to non-root user
RUN chown -R mastra:nodejs /app
USER mastra

# Expose port (Cloud Run uses $PORT env var)
EXPOSE 8080

# Use flexible entry point
CMD ["/app/entrypoint.sh"]