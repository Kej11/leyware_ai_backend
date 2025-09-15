import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { redditScoutWorkflow } from '../workflows/reddit-scout-workflow';
import { itchioScoutWorkflow } from '../workflows/itchio-scout-workflow';
import { steamScoutWorkflow } from '../workflows/steam-scout-workflow';
import {
  lookupScoutTool,
  createScoutRunTool,
  finalizeScoutRunTool
} from '../tools/database-tools';

export const scoutWorkflowAgent = new Agent({
  name: 'ScoutWorkflowAgent',
  description: 'Orchestrates platform-specific scout search workflows',
  instructions: `You are an intelligent orchestrator for scout searches across multiple platforms.
    
    When given a scout_id, you will:
    1. Use lookupScoutTool to get the scout configuration (this returns the scout object with instructions, keywords, platform, etc.)
    2. Use createScoutRunTool to create a new scout run record (this returns a run_id)
    3. Based on the scout's platform, execute the appropriate workflow:
       - For Reddit scouts: Execute redditScoutWorkflow with input: { scout: [scout object], run_id: [run_id] }
       - For Itch.io scouts (platform "itchio" or "itch.io"): Execute itchioScoutWorkflow with input: { scout: [scout object], run_id: [run_id] }
       - For Steam scouts: Execute steamScoutWorkflow with input: { scout: [scout object], run_id: [run_id] }
    4. Use finalizeScoutRunTool with the workflow results to complete the scout run
    
    IMPORTANT: When calling workflows, you must pass BOTH the scout object from lookupScoutTool AND the run_id from createScoutRunTool.
    The scout object contains: id, name, instructions, keywords, platform, max_results, quality_threshold, frequency, organization_id
    
    Each platform workflow is optimized for its specific characteristics:
    - Reddit: Parallel subreddit searches with upvote/comment scoring (quality threshold 0.5)
    - Itch.io: Intelligent two-step scraping with AI investigation and storage decisions (quality threshold 0.3 for inclusivity)
    - Steam: Paginated API searches with comprehensive analysis (quality threshold 0.6 for selectivity)
    
    The workflow handles all communication and logging. You only need to orchestrate the execution without generating additional responses.`,
  
  model: google('gemini-2.5-pro'),
  
  workflows: {
    redditScoutWorkflow,
    itchioScoutWorkflow,
    steamScoutWorkflow
  },
  
  tools: {
    lookupScoutTool,
    createScoutRunTool,
    finalizeScoutRunTool
  }
});

export function createScoutWorkflowAgent() {
  return scoutWorkflowAgent;
}