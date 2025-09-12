import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { scoutSearchWorkflow } from './workflows/scout-search-workflow';
import { intelligentScoutWorkflow } from './workflows/intelligent-scout-workflow';
import { searchPlanningAgent } from './agents/search-planning-agent';
import { contentAnalysisAgent } from './agents/content-analysis-agent';
import { scoutWorkflowAgent } from './agents/scout-workflow-agent';
import { investigationDecisionAgent } from './agents/investigation-decision-agent';
import { storageDecisionAgent } from './agents/storage-decision-agent';

export const mastra = new Mastra({
  workflows: { 
    scoutSearchWorkflow,
    intelligentScoutWorkflow
  },
  agents: {
    searchPlanningAgent,
    contentAnalysisAgent,
    scoutWorkflowAgent,
    investigationDecisionAgent,
    storageDecisionAgent
  },
  storage: new PostgresStore({
    connectionString: process.env.NEON_DATABASE_URL!,
    schemaName: "mastra"
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: process.env.LOG_LEVEL || 'info',
  })
});