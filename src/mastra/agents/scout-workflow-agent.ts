import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { scoutSearchWorkflow } from '../workflows/scout-search-workflow';

export const scoutWorkflowAgent = new Agent({
  name: 'ScoutWorkflowAgent',
  description: 'Executes scout search workflows based on scout ID',
  instructions: `You are a workflow orchestrator for scout searches.
    
    When given a scout_id, execute the scout search workflow.
    The workflow will:
    1. Lookup the scout configuration
    2. Generate a search strategy
    3. Execute platform searches
    4. Analyze content with AI
    5. Store results in the database
    
    Call the scoutSearchWorkflow with the provided scout_id.
    
    Return the workflow execution results including run_id and statistics.`,
  
  model: google('gemini-2.5-pro'),
  
  workflows: {
    scoutSearchWorkflow
  }
});

export function createScoutWorkflowAgent() {
  return scoutWorkflowAgent;
}