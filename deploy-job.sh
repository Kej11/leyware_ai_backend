#!/bin/bash

# Scout Workflow Cloud Run Job Deployment Script

set -e

# Configuration
PROJECT_ID="cogent-elevator-414506"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="scout-workflow"
JOB_NAME="scout-workflow-job"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting deployment of Scout Workflow Job to Cloud Run${NC}"
echo -e "${YELLOW}Project: $PROJECT_ID${NC}"
echo -e "${YELLOW}Region: $REGION${NC}"

# Set the project
echo "Setting GCP project..."
gcloud config set project $PROJECT_ID

# Build and push image (using same image as service)
echo -e "${YELLOW}📦 Building container image...${NC}"
gcloud builds submit --tag $IMAGE_NAME --project=$PROJECT_ID

# Deploy Cloud Run Job
echo -e "${YELLOW}⚙️  Deploying Cloud Run Job...${NC}"
gcloud run jobs deploy $JOB_NAME \
    --image $IMAGE_NAME \
    --region $REGION \
    --max-retries 3 \
    --parallelism 10 \
    --task-timeout 86400 \
    --set-env-vars MODE=job,NODE_ENV=production,LOG_LEVEL=info \
    --update-secrets "NEON_DATABASE_URL=NEON_DATABASE_URL:latest,GOOGLE_GENERATIVE_AI_API_KEY=GOOGLE_GENERATIVE_AI_API_KEY:latest" \
    --project=$PROJECT_ID

echo -e "${GREEN}✅ Job deployment complete!${NC}"
echo ""
echo -e "${BLUE}📋 Job Configuration:${NC}"
echo "  - Name: $JOB_NAME"
echo "  - Region: $REGION"
echo "  - Timeout: 24 hours"
echo "  - Max Retries: 3"
echo "  - Parallelism: 10 (can run 10 jobs simultaneously)"
echo ""
echo -e "${BLUE}🧪 Test Job Execution:${NC}"
echo ""
echo -e "${YELLOW}From command line:${NC}"
echo "gcloud run jobs execute $JOB_NAME \\"
echo "  --region $REGION \\"
echo "  --set-env-vars SCOUT_ID=your-scout-id,RUN_ID=optional-run-id \\"
echo "  --project $PROJECT_ID"
echo ""
echo -e "${YELLOW}From your Vercel API (example):${NC}"
echo "const { CloudRunJobsClient } = require('@google-cloud/run');"
echo "const jobsClient = new CloudRunJobsClient();"
echo ""
echo "await jobsClient.runJob({"
echo "  name: 'projects/$PROJECT_ID/locations/$REGION/jobs/$JOB_NAME',"
echo "  overrides: {"
echo "    containerOverrides: [{"
echo "      env: ["
echo "        { name: 'SCOUT_ID', value: 'your-scout-id' },"
echo "        { name: 'RUN_ID', value: 'optional-run-id' }"
echo "      ]"
echo "    }]"
echo "  }"
echo "});"
echo ""
echo -e "${GREEN}🎯 Job ready for triggering from external systems!${NC}"