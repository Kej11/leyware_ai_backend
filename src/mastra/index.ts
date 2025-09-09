import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { scoutSearchWorkflow } from './workflows/scout-search-workflow';
import { emailProcessingWorkflow } from './workflows/email-processing-workflow';
import { manualPDFParseWorkflow } from './workflows/manual-pdf-parse-workflow';
import { intelligentScoutWorkflow } from './workflows/intelligent-scout-workflow';
import { searchPlanningAgent } from './agents/search-planning-agent';
import { contentAnalysisAgent } from './agents/content-analysis-agent';
import { scoutWorkflowAgent } from './agents/scout-workflow-agent';
import { emailWebhookAgent } from './agents/email-webhook-agent';
import { investigationDecisionAgent } from './agents/investigation-decision-agent';
import { storageDecisionAgent } from './agents/storage-decision-agent';

export const mastra = new Mastra({
  workflows: { 
    scoutSearchWorkflow,
    emailProcessingWorkflow,
    manualPDFParseWorkflow,
    intelligentScoutWorkflow
  },
  agents: {
    searchPlanningAgent,
    contentAnalysisAgent,
    scoutWorkflowAgent,
    emailWebhookAgent,
    investigationDecisionAgent,
    storageDecisionAgent
  },
  storage: new PostgresStore({
    url: process.env.NEON_DATABASE_URL!,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: process.env.LOG_LEVEL || 'info',
  })
});