import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  updateRunStatusTool,
  batchStoreResultsTool,
  updateRunProgressTool
} from '../tools/database-tools';
import { generateSearchStrategy } from '../agents/search-planning-agent';
import { batchAnalyzeContent } from '../agents/content-analysis-agent';
import { SteamSearchTool } from '../tools/platform-search/steam-search-tool';

const updateRunStatusStep = createStep(updateRunStatusTool);
const batchStoreResultsStep = createStep(batchStoreResultsTool);
const updateRunProgressStep = createStep(updateRunProgressTool);

// Input/Output schemas
const scoutInputSchema = z.object({
  scout: z.object({
    id: z.string(),
    name: z.string(),
    instructions: z.string(),
    keywords: z.array(z.string()),
    platform: z.string(),
    max_results: z.number(),
    quality_threshold: z.number(),
    frequency: z.string(),
    organization_id: z.string()
  }),
  run_id: z.string()
});

const resultsSchema = z.object({
  success: z.boolean(),
  run_id: z.string(),
  results_count: z.number(),
  high_relevance_count: z.number(),
  execution_time_ms: z.number()
});

// Generate Steam-specific search strategy
const generateSteamStrategyStep = createStep({
  id: 'generate-steam-strategy',
  description: 'Generate Steam-specific search strategy',
  inputSchema: scoutInputSchema,
  outputSchema: z.object({
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { scout, run_id } = inputData;
    const logger = mastra.getLogger();
    
    logger.info('Generating Steam search strategy', {
      scoutName: scout?.name || 'unknown',
      runId: run_id
    });
    
    const strategy = await generateSearchStrategy(
      scout.instructions,
      scout.keywords,
      'steam',
      scout.frequency
    );
    
    return { strategy, scout, run_id };
  }
});

// Search Steam with pagination
const searchSteamPageStep = createStep({
  id: 'search-steam-page',
  description: 'Search Steam API with pagination support',
  inputSchema: z.object({
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string(),
    currentPage: z.number().default(0),
    allResults: z.array(z.any()).default([]),
    hasMorePages: z.boolean().default(true)
  }),
  outputSchema: z.object({
    allResults: z.array(z.any()),
    currentPage: z.number(),
    hasMorePages: z.boolean(),
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { strategy, scout, run_id, currentPage, allResults } = inputData;
    const logger = mastra.getLogger();
    
    logger.info('Searching Steam page', {
      page: currentPage,
      currentResults: allResults.length,
      runId: run_id
    });
    
    const searchTool = new SteamSearchTool();
    
    // Modify strategy for this page
    const pageStrategy = {
      ...strategy,
      search_params: {
        ...strategy.search_params,
        page: currentPage,
        maxResults: 25 // Per page limit
      }
    };
    
    try {
      const pageResults = await searchTool.search(pageStrategy);
      const newAllResults = [...allResults, ...pageResults];
      
      // Check if we should continue pagination
      const hasMorePages = pageResults.length === 25 && // Full page returned
                          newAllResults.length < scout.max_results && // Haven't hit scout limit
                          currentPage < 5; // Max 5 pages for safety
      
      logger.info('Steam page search completed', {
        pageResults: pageResults.length,
        totalResults: newAllResults.length,
        hasMorePages,
        runId: run_id
      });
      
      return {
        allResults: newAllResults,
        currentPage: currentPage + 1,
        hasMorePages,
        strategy,
        scout,
        run_id
      };
      
    } catch (error) {
      logger.error('Steam page search failed', {
        page: currentPage,
        error: error instanceof Error ? error.message : String(error),
        runId: run_id
      });
      
      return {
        allResults,
        currentPage: currentPage + 1,
        hasMorePages: false, // Stop on error
        strategy,
        scout,
        run_id
      };
    }
  }
});

// Analyze Steam content with platform-specific scoring
const analyzeSteamContentStep = createStep({
  id: 'analyze-steam-content',
  description: 'Analyze Steam content with platform-specific scoring',
  inputSchema: z.object({
    allResults: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    analyzed_results: z.array(z.any()),
    high_relevance_count: z.number(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { allResults, scout, run_id } = inputData;
    const logger = mastra.getLogger();
    
    // Override quality threshold to 0.6 for Steam (more selective due to volume)
    const effectiveThreshold = Math.min(scout.quality_threshold, 0.6);
    
    logger.info('Starting Steam content analysis', {
      resultsToAnalyze: allResults.length,
      originalThreshold: scout.quality_threshold,
      effectiveThreshold: effectiveThreshold,
      runId: run_id
    });
    
    const analyzed = await batchAnalyzeContent(
      mastra,
      scout.instructions,
      scout.keywords,
      allResults,
      effectiveThreshold
    );
    
    const highRelevance = analyzed.filter(r => r.relevance_score >= 0.8).length;
    
    logger.info('Steam content analysis completed', {
      analyzedCount: analyzed.length,
      highRelevanceCount: highRelevance,
      runId: run_id
    });
    
    return {
      analyzed_results: analyzed.slice(0, scout.max_results),
      high_relevance_count: highRelevance,
      scout,
      run_id
    };
  }
});

// Store Steam results
const storeSteamResultsStep = createStep({
  id: 'store-steam-results',
  description: 'Store Steam search results in database',
  inputSchema: z.object({
    analyzed_results: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    high_relevance_count: z.number()
  }),
  outputSchema: resultsSchema,
  execute: async ({ inputData, mastra }) => {
    const { analyzed_results, scout, run_id, high_relevance_count } = inputData;
    const logger = mastra.getLogger();
    const startTime = Date.now();
    
    if (analyzed_results.length > 0) {
      await batchStoreResultsStep.execute({
        context: {
          run_id,
          scout_id: scout.id,
          organization_id: scout.organization_id,
          results: analyzed_results
        },
        runtimeContext: {} as any
      });
      
      logger.info('Steam results stored', {
        storedCount: analyzed_results.length,
        runId: run_id
      });
    } else {
      logger.warn('No Steam results to store', { runId: run_id });
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      success: true,
      run_id,
      results_count: analyzed_results.length,
      high_relevance_count,
      execution_time_ms: executionTime
    };
  }
});

// Main Steam Scout Workflow
export const steamScoutWorkflow = createWorkflow({
  id: 'steam-scout-workflow', 
  description: 'Steam-specific scout workflow with pagination and API integration',
  inputSchema: scoutInputSchema,
  outputSchema: resultsSchema
})
  // Update run status to searching
  .map(({ inputData }) => ({
    run_id: inputData.run_id,
    status: 'searching' as const,
    step_name: 'generate_steam_strategy',
    step_data: { platform: 'steam' }
  }))
  .then(updateRunStatusStep)
  
  // Generate Steam search strategy - get scout from initial workflow input
  .map(({ getInitData }) => {
    const initialInput = getInitData();
    return {
      scout: initialInput.scout,
      run_id: initialInput.run_id
    };
  })
  .then(generateSteamStrategyStep)
  
  // Initialize pagination state
  .map(({ getStepResult }) => {
    const { strategy, scout, run_id } = getStepResult(generateSteamStrategyStep);
    return {
      strategy,
      scout,
      run_id,
      currentPage: 0,
      allResults: [],
      hasMorePages: true
    };
  })
  
  // Loop through pages until no more results or limit reached
  .dountil(
    searchSteamPageStep,
    async ({ inputData }) => !inputData.hasMorePages
  )
  
  // Extract final results and analyze
  .map(({ inputData }) => ({
    allResults: inputData.allResults,
    scout: inputData.scout,
    run_id: inputData.run_id
  }))
  .then(analyzeSteamContentStep)
  
  // Store results
  .then(storeSteamResultsStep)
  
  .commit();