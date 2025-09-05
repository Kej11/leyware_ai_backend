import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { scoutSearchWorkflow } from './workflows/scout-search-workflow';
import { searchPlanningAgent } from './agents/search-planning-agent';
import { contentAnalysisAgent } from './agents/content-analysis-agent';
import { scoutWorkflowAgent } from './agents/scout-workflow-agent';

export const mastra = new Mastra({
  workflows: { 
    scoutSearchWorkflow 
  },
  agents: {
    searchPlanningAgent,
    contentAnalysisAgent,
    scoutWorkflowAgent
  },
  storage: new LibSQLStore({
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: process.env.LOG_LEVEL || 'info',
  }),
  server: {
    port: parseInt(process.env.PORT || '8080'),
  }
});