#!/bin/bash

# Scout Workflow Cloud Run Deployment Script

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="scout-workflow"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting deployment of Scout Workflow to Cloud Run${NC}"

# Check if project ID is set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID environment variable is not set${NC}"
    echo "Please set it with: export GCP_PROJECT_ID=your-project-id"
    exit 1
fi

echo -e "${YELLOW}Project: $PROJECT_ID${NC}"
echo -e "${YELLOW}Region: $REGION${NC}"

# Set the project
echo "Setting GCP project..."
gcloud config set project $PROJECT_ID

# Check if secrets exist, create them if not
echo "Checking secrets..."
if ! gcloud secrets describe NEON_DATABASE_URL --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -e "${YELLOW}Creating secret NEON_DATABASE_URL...${NC}"
    echo -e "${RED}Please enter your NEON_DATABASE_URL:${NC}"
    read -s NEON_URL
    echo "$NEON_URL" | gcloud secrets create NEON_DATABASE_URL --data-file=- --project=$PROJECT_ID
else
    echo -e "${GREEN}✓ Secret NEON_DATABASE_URL exists${NC}"
fi

if ! gcloud secrets describe GOOGLE_GENERATIVE_AI_API_KEY --project=$PROJECT_ID >/dev/null 2>&1; then
    echo -e "${YELLOW}Creating secret GOOGLE_GENERATIVE_AI_API_KEY...${NC}"
    echo -e "${RED}Please enter your GOOGLE_GENERATIVE_AI_API_KEY:${NC}"
    read -s GOOGLE_KEY
    echo "$GOOGLE_KEY" | gcloud secrets create GOOGLE_GENERATIVE_AI_API_KEY --data-file=- --project=$PROJECT_ID
else
    echo -e "${GREEN}✓ Secret GOOGLE_GENERATIVE_AI_API_KEY exists${NC}"
fi

# Build and submit
echo -e "${YELLOW}Building and deploying container...${NC}"
gcloud builds submit \
    --tag gcr.io/$PROJECT_ID/$SERVICE_NAME \
    --project=$PROJECT_ID

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
    --region $REGION \
    --platform managed \
    --timeout 1800 \
    --memory 4Gi \
    --cpu 2 \
    --min-instances 0 \
    --max-instances 10 \
    --allow-unauthenticated \
    --set-env-vars NODE_ENV=production,LOG_LEVEL=info \
    --update-secrets "NEON_DATABASE_URL=NEON_DATABASE_URL:latest,GOOGLE_GENERATIVE_AI_API_KEY=GOOGLE_GENERATIVE_AI_API_KEY:latest" \
    --project=$PROJECT_ID

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}Service URL: $SERVICE_URL${NC}"
echo ""
echo -e "${YELLOW}Available endpoints:${NC}"
echo "  - Workflows: $SERVICE_URL/api/workflows"
echo "  - Execute Scout Workflow: POST $SERVICE_URL/api/workflows/scoutSearchWorkflow/execute"
echo "  - Agents: $SERVICE_URL/api/agents"
echo ""
echo -e "${YELLOW}Test with:${NC}"
echo "curl -X POST $SERVICE_URL/api/workflows/scoutSearchWorkflow/execute \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"scout_id\": \"your-scout-id\"}'"