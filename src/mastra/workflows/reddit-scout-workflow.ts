import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  updateRunStatusTool,
  batchStoreResultsTool,
  updateRunProgressTool
} from '../tools/database-tools';
import { generateSearchStrategy } from '../agents/search-planning-agent';
import { batchAnalyzeContent } from '../agents/content-analysis-agent';
import { getRedditClient } from '../tools/platform-search/reddit-api-client';
import { RedditSearchParams, RedditPost } from '../tools/platform-search/reddit-api-types';
import { PlatformSearchResult } from '../database/schemas';

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

// Generate Reddit-specific search strategy
const generateRedditStrategyStep = createStep({
  id: 'generate-reddit-strategy',
  description: 'Generate Reddit-specific search strategy',
  inputSchema: scoutInputSchema,
  outputSchema: z.object({
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { scout, run_id } = inputData;
    const logger = mastra.getLogger();
    
    logger.info('Generating Reddit search strategy', {
      scoutName: scout?.name || 'unknown',
      runId: run_id
    });
    
    const strategy = await generateSearchStrategy(
      scout.instructions,
      scout.keywords,
      'reddit',
      scout.frequency
    );
    
    return { strategy, scout, run_id };
  }
});

// Search individual subreddit
const createSubredditSearchStep = (subreddit: string) => createStep({
  id: `search-subreddit-${subreddit}`,
  description: `Search r/${subreddit} for relevant posts`,
  inputSchema: z.object({
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    results: z.array(z.any()),
    subreddit: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { strategy, scout } = inputData;
    const logger = mastra.getLogger();
    
    const search_params = strategy.search_params;
    const client = getRedditClient();
    
    logger.info(`Searching r/${subreddit}`, {
      keywords: search_params.keywords,
      timeFilter: search_params.time_filter
    });
    
    try {
      const searchQuery = search_params.keywords.join(' OR ');
      const searchParams: RedditSearchParams = {
        q: searchQuery,
        sort: search_params.sort === 'relevance' ? 'relevance' : search_params.sort as any,
        t: search_params.time_filter,
        limit: Math.min(search_params.limit || 25, 100),
        restrict_sr: true
      };

      const listing = await client.searchSubreddit(subreddit, searchParams);
      const results: PlatformSearchResult[] = [];
      
      if (listing.data?.children) {
        for (const child of listing.data.children) {
          const post: RedditPost = child.data;
          
          if (post.is_self || post.selftext || post.title) {
            results.push({
              platform: 'reddit',
              source_url: `https://reddit.com${post.permalink}`,
              title: post.title,
              content: post.selftext || post.title,
              author: post.author,
              author_url: `https://reddit.com/u/${post.author}`,
              engagement_score: calculateRedditEngagementScore({
                score: post.score,
                num_comments: post.num_comments,
                upvote_ratio: post.upvote_ratio
              }),
              metadata: {
                subreddit: post.subreddit,
                post_id: post.id,
                score: post.score,
                num_comments: post.num_comments,
                created_utc: post.created_utc,
                upvote_ratio: post.upvote_ratio,
                awards: post.total_awards_received || 0,
                is_video: post.is_video,
                over_18: post.over_18
              },
              created_at: new Date(post.created_utc * 1000).toISOString()
            });
          }
        }
      }
      
      logger.info(`Found ${results.length} posts in r/${subreddit}`);
      return { results, subreddit };
      
    } catch (error) {
      logger.error(`Error searching r/${subreddit}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return { results: [], subreddit };
    }
  }
});

// Calculate Reddit-specific engagement score
function calculateRedditEngagementScore(metadata: {
  score: number;
  num_comments: number;
  upvote_ratio: number;
}): number {
  const { score, num_comments, upvote_ratio } = metadata;
  
  // Base score from upvotes (normalized)
  let engagementScore = Math.max(0, Math.min(score / 100, 1)) * 40;
  
  // Comment engagement
  engagementScore += Math.min(num_comments / 10, 1) * 30;
  
  // Upvote ratio quality
  engagementScore += (upvote_ratio || 0.5) * 20;
  
  // Bonus for highly engaged posts
  if (score > 1000) engagementScore += 10;
  
  return Math.min(Math.round(engagementScore), 100);
}

// Merge results from parallel subreddit searches
const mergeRedditResultsStep = createStep({
  id: 'merge-reddit-results',
  description: 'Merge results from parallel subreddit searches',
  inputSchema: z.object({
    subredditResults: z.array(z.object({
      results: z.array(z.any()),
      subreddit: z.string()
    })),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    merged_results: z.array(z.any()),
    total_searched: z.number(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { subredditResults, scout, run_id } = inputData;
    const logger = mastra.getLogger();
    
    const merged_results: PlatformSearchResult[] = [];
    let totalSearched = 0;
    
    for (const subredditResult of subredditResults) {
      // Defensive check for null/undefined results
      if (!subredditResult || !subredditResult.results) {
        logger.warn('Skipping null or invalid subreddit result', {
          subredditResult: subredditResult,
          runId: run_id
        });
        continue;
      }
      
      merged_results.push(...subredditResult.results);
      totalSearched += subredditResult.results.length;
      
      logger.info('Merged subreddit results', {
        subreddit: subredditResult.subreddit,
        count: subredditResult.results.length
      });
    }
    
    // Limit to scout's max_results and remove duplicates
    const uniqueResults = merged_results.filter((result, index, self) =>
      index === self.findIndex(r => r.source_url === result.source_url)
    );
    
    const finalResults = uniqueResults
      .sort((a, b) => b.engagement_score - a.engagement_score)
      .slice(0, scout.max_results * 2);
    
    logger.info('Reddit search merge completed', {
      totalSearched,
      uniqueResults: uniqueResults.length,
      finalResults: finalResults.length,
      runId: run_id
    });
    
    return {
      merged_results: finalResults,
      total_searched: totalSearched,
      scout,
      run_id
    };
  }
});

// Analyze Reddit content with platform-specific scoring
const analyzeRedditContentStep = createStep({
  id: 'analyze-reddit-content',
  description: 'Analyze Reddit content with platform-specific scoring',
  inputSchema: z.object({
    merged_results: z.array(z.any()),
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
  execute: async ({ inputData, mastra }) => {
    const { merged_results, scout, run_id, total_searched } = inputData;
    const logger = mastra.getLogger();
    
    // Override quality threshold to 0.5 for Reddit (balanced approach)
    const effectiveThreshold = Math.min(scout.quality_threshold, 0.5);
    
    logger.info('Starting Reddit content analysis', {
      resultsToAnalyze: merged_results.length,
      originalThreshold: scout.quality_threshold,
      effectiveThreshold: effectiveThreshold,
      runId: run_id
    });
    
    const analyzed = await batchAnalyzeContent(
      mastra,
      scout.instructions,
      scout.keywords,
      merged_results,
      effectiveThreshold
    );
    
    const highRelevance = analyzed.filter(r => r.relevance_score >= 0.8).length;
    
    logger.info('Reddit content analysis completed', {
      analyzedCount: analyzed.length,
      highRelevanceCount: highRelevance,
      runId: run_id
    });
    
    return {
      analyzed_results: analyzed.slice(0, scout.max_results),
      high_relevance_count: highRelevance,
      scout,
      run_id,
      total_searched
    };
  }
});

// Store Reddit results
const storeRedditResultsStep = createStep({
  id: 'store-reddit-results',
  description: 'Store Reddit search results in database',
  inputSchema: z.object({
    analyzed_results: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    total_searched: z.number(),
    high_relevance_count: z.number()
  }),
  outputSchema: resultsSchema,
  execute: async ({ inputData, mastra }) => {
    const { analyzed_results, scout, run_id, total_searched, high_relevance_count } = inputData;
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
      
      logger.info('Reddit results stored', {
        storedCount: analyzed_results.length,
        runId: run_id
      });
    } else {
      logger.warn('No Reddit results to store', {
        runId: run_id
      });
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

// Main Reddit Scout Workflow
export const redditScoutWorkflow = createWorkflow({
  id: 'reddit-scout-workflow',
  description: 'Reddit-specific scout workflow with parallel subreddit searches',
  inputSchema: scoutInputSchema,
  outputSchema: resultsSchema
})
  // Update run status to searching
  .map(({ inputData }) => ({
    run_id: inputData.run_id,
    status: 'searching' as const,
    step_name: 'generate_reddit_strategy',
    step_data: { platform: 'reddit' }
  }))
  .then(updateRunStatusStep)
  
  // Generate Reddit search strategy - get scout from initial workflow input  
  .map(({ getInitData }) => {
    const initialInput = getInitData();
    return {
      scout: initialInput.scout,
      run_id: initialInput.run_id
    };
  })
  .then(generateRedditStrategyStep)
  
  // Parallel subreddit searches
  .map(({ getStepResult }) => {
    const { strategy, scout, run_id } = getStepResult(generateRedditStrategyStep);
    const subreddits = strategy.search_params?.subreddits || ['IndieGaming', 'IndieGames', 'IndieDev'];
    
    return {
      strategy,
      scout,
      run_id,
      subreddits
    };
  })
  .parallel([
    createStep({
      id: 'search-subreddit-0',
      execute: async ({ inputData, mastra }) => {
        const step = createSubredditSearchStep(inputData.subreddits[0] || 'IndieGaming');
        return step.execute({ inputData, mastra, runtimeContext: {} as any });
      }
    }),
    createStep({
      id: 'search-subreddit-1', 
      execute: async ({ inputData, mastra }) => {
        const step = createSubredditSearchStep(inputData.subreddits[1] || 'IndieGames');
        return step.execute({ inputData, mastra, runtimeContext: {} as any });
      }
    }),
    createStep({
      id: 'search-subreddit-2',
      execute: async ({ inputData, mastra }) => {
        const step = createSubredditSearchStep(inputData.subreddits[2] || 'IndieDev');
        return step.execute({ inputData, mastra, runtimeContext: {} as any });
      }
    })
  ])
  
  // Merge parallel search results
  .map(({ getStepResult, mastra }) => {
    const { scout, run_id } = getStepResult(generateRedditStrategyStep);
    const logger = mastra.getLogger();
    
    const subredditResults = [
      getStepResult('search-subreddit-0'),
      getStepResult('search-subreddit-1'),
      getStepResult('search-subreddit-2')
    ];
    
    logger.info('Retrieved parallel subreddit search results', {
      resultCount: subredditResults.length,
      results: subredditResults.map((result, index) => ({
        index,
        isNull: result === null,
        isUndefined: result === undefined,
        hasResults: result?.results ? result.results.length : 'N/A',
        subreddit: result?.subreddit || 'unknown'
      })),
      runId: run_id
    });
    
    return { subredditResults, scout, run_id };
  })
  .then(mergeRedditResultsStep)
  
  // Analyze content
  .then(analyzeRedditContentStep)
  
  // Store results
  .then(storeRedditResultsStep)
  
  .commit();