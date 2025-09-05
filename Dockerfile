FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Copy job runner after build
COPY src/job-runner.ts .mastra/output/job-runner.mjs

# Create entry point script
RUN echo '#!/bin/sh\n\
if [ "$MODE" = "job" ]; then\n\
  echo "🚀 Starting in Job mode..."\n\
  node .mastra/output/job-runner.mjs\n\
else\n\
  echo "🌐 Starting in Service mode..."\n\
  node --import=./.mastra/output/instrumentation.mjs .mastra/output/index.mjs\n\
fi' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose port (only needed for service mode)
EXPOSE 8080

# Use flexible entry point
CMD ["/app/entrypoint.sh"]