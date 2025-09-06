import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  lookupScoutTool,
  createScoutRunTool,
  updateRunStatusTool,
  batchStoreResultsTool,
  finalizeScoutRunTool
} from '../tools/database-tools';
import { redditSearchTool } from '../tools/platform-search/reddit-search-tool';
import { itchioSearchTool } from '../tools/platform-search/itchio-search-tool';
import { steamSearchTool } from '../tools/platform-search/steam-search-tool';
import { generateSearchStrategy } from '../agents/search-planning-agent';
import { batchAnalyzeContent } from '../agents/content-analysis-agent';

const lookupScoutStep = createStep(lookupScoutTool);
const createScoutRunStep = createStep(createScoutRunTool);
const updateRunStatusStep = createStep(updateRunStatusTool);
const batchStoreResultsStep = createStep(batchStoreResultsTool);
const finalizeScoutRunStep = createStep(finalizeScoutRunTool);

const generateStrategyStep = createStep({
  id: 'generate-strategy',
  description: 'Generate platform-specific search strategy using AI',
  inputSchema: z.object({
    scout: z.object({
      id: z.string(),
      name: z.string(),
      instructions: z.string(),
      keywords: z.array(z.string()),
      platform: z.string(),
      platform_config: z.any(),
      max_results: z.number(),
      quality_threshold: z.number(),
      frequency: z.string()
    }),
    run_id: z.string()
  }),
  outputSchema: z.object({
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData }) => {
    const { scout, run_id } = inputData;
    
    console.log(`🎯 Generating search strategy for ${scout.platform}...`);
    
    const strategy = await generateSearchStrategy(
      scout.instructions,
      scout.keywords,
      scout.platform,
      scout.frequency
    );
    
    return {
      strategy,
      scout,
      run_id
    };
  }
});

const executePlatformSearchStep = createStep({
  id: 'execute-platform-search',
  description: 'Execute search on the target platform',
  inputSchema: z.object({
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    raw_results: z.array(z.any()),
    total_searched: z.number(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData }) => {
    const { strategy, scout, run_id } = inputData;
    
    console.log(`🔍 Executing ${strategy.platform} search...`);
    
    let results = [];
    let totalSearched = 0;
    
    if (strategy.platform === 'reddit') {
      const searchResult = await redditSearchTool.execute({
        context: { strategy },
        runtimeContext: {} as any
      });
      
      results = searchResult.results;
      totalSearched = searchResult.total_searched;
    } else if (strategy.platform === 'itchio') {
      const searchResult = await itchioSearchTool.execute({
        context: { strategy },
        runtimeContext: {} as any
      });
      
      results = searchResult.results;
      totalSearched = searchResult.total_searched;
    } else if (strategy.platform === 'steam') {
      const searchResult = await steamSearchTool.execute({
        context: { strategy },
        runtimeContext: {} as any
      });
      
      results = searchResult.results;
      totalSearched = searchResult.total_searched;
    } else {
      throw new Error(`Unsupported platform: ${strategy.platform}`);
    }
    
    console.log(`📊 Found ${totalSearched} results`);
    
    return {
      raw_results: results.slice(0, scout.max_results * 2),
      total_searched: totalSearched,
      scout,
      run_id
    };
  }
});

const analyzeContentStep = createStep({
  id: 'analyze-content',
  description: 'Analyze content relevance using AI',
  inputSchema: z.object({
    raw_results: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    total_searched: z.number()
  }),
  outputSchema: z.object({
    analyzed_results: z.array(z.any()),
    high_relevance_count: z.number(),
    scout: z.any(),
    run_id: z.string(),
    total_searched: z.number()
  }),
  execute: async ({ inputData }) => {
    const { raw_results, scout, run_id, total_searched } = inputData;
    
    console.log(`🤖 Analyzing ${raw_results.length} results with AI...`);
    
    const analyzed = await batchAnalyzeContent(
      scout.instructions,
      scout.keywords,
      raw_results,
      scout.quality_threshold
    );
    
    const highRelevance = analyzed.filter(r => r.relevance_score >= 0.8).length;
    
    console.log(`✨ ${analyzed.length} results passed quality threshold (${highRelevance} high relevance)`);
    
    return {
      analyzed_results: analyzed.slice(0, scout.max_results),
      high_relevance_count: highRelevance,
      scout,
      run_id,
      total_searched
    };
  }
});

export const scoutSearchWorkflow = createWorkflow({
  id: 'scout-search-workflow',
  description: 'Execute intelligent search and analysis for content scouts',
  inputSchema: z.object({
    scout_id: z.string().uuid()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    run_id: z.string(),
    results_count: z.number(),
    high_relevance_count: z.number(),
    execution_time_ms: z.number()
  })
})
  .map(({ inputData }) => ({
    scout_id: inputData.scout_id
  }))
  .then(lookupScoutStep)
  
  .map(({ getStepResult }) => {
    const scoutResult = getStepResult(lookupScoutStep);
    return {
      scout_id: scoutResult.scout.id,
      organization_id: scoutResult.scout.organization_id,
      max_results: scoutResult.scout.max_results,
      quality_threshold: scoutResult.scout.quality_threshold
    };
  })
  .then(createScoutRunStep)
  
  .map(({ getStepResult }) => {
    const scoutResult = getStepResult(lookupScoutStep);
    const runResult = getStepResult(createScoutRunStep);
    return {
      run_id: runResult.run_id,
      status: 'searching',
      step_name: 'generate_strategy',
      step_data: { scout_name: scoutResult.scout.name }
    };
  })
  .then(updateRunStatusStep)
  
  .map(({ getStepResult }) => {
    const scoutResult = getStepResult(lookupScoutStep);
    const runResult = getStepResult(createScoutRunStep);
    return {
      scout: scoutResult.scout,
      run_id: runResult.run_id
    };
  })
  .then(generateStrategyStep)
  
  .map(({ getStepResult }) => {
    const runResult = getStepResult(createScoutRunStep);
    return {
      run_id: runResult.run_id,
      status: 'searching',
      step_name: 'execute_search',
      step_data: {}
    };
  })
  .then(updateRunStatusStep)
  
  .map(({ getStepResult }) => {
    const strategyResult = getStepResult(generateStrategyStep);
    const runResult = getStepResult(createScoutRunStep);
    return {
      strategy: strategyResult.strategy,
      scout: strategyResult.scout,
      run_id: runResult.run_id
    };
  })
  .then(executePlatformSearchStep)
  
  .map(({ getStepResult }) => {
    const runResult = getStepResult(createScoutRunStep);
    const searchResult = getStepResult(executePlatformSearchStep);
    return {
      run_id: runResult.run_id,
      status: 'analyzing',
      step_name: 'analyze_content',
      step_data: { total_found: searchResult.total_searched }
    };
  })
  .then(updateRunStatusStep)
  
  .map(({ getStepResult }) => {
    const strategyResult = getStepResult(generateStrategyStep);
    const searchResult = getStepResult(executePlatformSearchStep);
    const runResult = getStepResult(createScoutRunStep);
    return {
      raw_results: searchResult.raw_results,
      scout: strategyResult.scout,
      run_id: runResult.run_id,
      total_searched: searchResult.total_searched
    };
  })
  .then(analyzeContentStep)
  
  .map(({ getStepResult }) => {
    const runResult = getStepResult(createScoutRunStep);
    const analysisResult = getStepResult(analyzeContentStep);
    return {
      run_id: runResult.run_id,
      status: 'storing',
      step_name: 'store_results',
      step_data: { to_store: analysisResult.analyzed_results.length }
    };
  })
  .then(updateRunStatusStep)
  
  .map(({ getStepResult }) => {
    const scoutResult = getStepResult(lookupScoutStep);
    const runResult = getStepResult(createScoutRunStep);
    const analysisResult = getStepResult(analyzeContentStep);
    
    return {
      scout_id: scoutResult.scout.id,
      run_id: runResult.run_id,
      organization_id: scoutResult.scout.organization_id,
      results: analysisResult.analyzed_results
    };
  })
  .then(batchStoreResultsStep)
  
  .map(({ getStepResult, getInitData }) => {
    const startTime = Date.now();
    const scoutResult = getStepResult(lookupScoutStep);
    const runResult = getStepResult(createScoutRunStep);
    const analysisResult = getStepResult(analyzeContentStep);
    const storeResult = getStepResult(batchStoreResultsStep);
    
    return {
      run_id: runResult.run_id,
      scout_id: scoutResult.scout.id,
      results_found: analysisResult.total_searched,
      results_processed: storeResult.total_stored,
      high_relevance_count: analysisResult.high_relevance_count,
      success: storeResult.success,
      error_message: undefined
    };
  })
  .then(finalizeScoutRunStep)
  
  .map(({ getStepResult }) => {
    const runResult = getStepResult(createScoutRunStep);
    const analysisResult = getStepResult(analyzeContentStep);
    const storeResult = getStepResult(batchStoreResultsStep);
    
    // Simple execution time (this could be improved by tracking actual start time)
    const executionTime = 0; // Placeholder - actual timing would need to be tracked throughout workflow
    
    return {
      success: true,
      run_id: runResult.run_id,
      results_count: storeResult.total_stored,
      high_relevance_count: analysisResult.high_relevance_count,
      execution_time_ms: executionTime
    };
  })
  .commit();