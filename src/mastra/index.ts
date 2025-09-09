import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { scoutSearchWorkflow } from './workflows/scout-search-workflow';
import { emailProcessingWorkflow } from './workflows/email-processing-workflow';
import { manualPDFParseWorkflow } from './workflows/manual-pdf-parse-workflow';
import { searchPlanningAgent } from './agents/search-planning-agent';
import { contentAnalysisAgent } from './agents/content-analysis-agent';
import { scoutWorkflowAgent } from './agents/scout-workflow-agent';
import { emailWebhookAgent } from './agents/email-webhook-agent';

export const mastra = new Mastra({
  workflows: { 
    scoutSearchWorkflow,
    emailProcessingWorkflow,
    manualPDFParseWorkflow
  },
  agents: {
    searchPlanningAgent,
    contentAnalysisAgent,
    scoutWorkflowAgent,
    emailWebhookAgent
  },
  storage: new LibSQLStore({
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: process.env.LOG_LEVEL || 'info',
  })
});