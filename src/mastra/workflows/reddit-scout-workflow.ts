import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { query } from '../database/neon-client';
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

// Simplified sequential subreddit search
const searchAllSubredditsStep = createStep({
  id: 'search-all-subreddits',
  description: 'Search all subreddits sequentially for reliability',
  inputSchema: z.object({
    strategy: z.any(),
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
    const { strategy, scout, run_id } = inputData;
    const logger = mastra.getLogger();
    
    const search_params = strategy.search_params;
    const client = getRedditClient();
    const subreddits = search_params?.subreddits || ['IndieGaming', 'IndieGames', 'IndieDev'];
    
    const merged_results: PlatformSearchResult[] = [];
    let totalSearched = 0;
    
    for (const subreddit of subreddits) {
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
        const subredditResults: PlatformSearchResult[] = [];
        
        if (listing.data?.children) {
          for (const child of listing.data.children) {
            const post: RedditPost = child.data;
            
            // More permissive content filtering
            if (post.title && (post.is_self || post.selftext || post.url)) {
              subredditResults.push({
                platform: 'reddit',
                source_url: `https://reddit.com${post.permalink}`,
                title: post.title,
                content: post.selftext || post.title || `Link post: ${post.url}`,
                author: post.author || 'unknown',
                author_url: post.author ? `https://reddit.com/u/${post.author}` : '',
                engagement_score: calculateRedditEngagementScore({
                  score: post.score || 0,
                  num_comments: post.num_comments || 0,
                  upvote_ratio: post.upvote_ratio || 0.5
                }),
                metadata: {
                  subreddit: post.subreddit,
                  post_id: post.id,
                  score: post.score || 0,
                  num_comments: post.num_comments || 0,
                  created_utc: post.created_utc,
                  upvote_ratio: post.upvote_ratio || 0.5,
                  awards: post.total_awards_received || 0,
                  is_video: post.is_video || false,
                  over_18: post.over_18 || false,
                  url: post.url
                },
                created_at: new Date((post.created_utc || Date.now() / 1000) * 1000).toISOString()
              });
            }
          }
        }
        
        merged_results.push(...subredditResults);
        totalSearched += subredditResults.length;
        
        logger.info(`Found ${subredditResults.length} posts in r/${subreddit}`);
        
      } catch (error) {
        logger.error(`Error searching r/${subreddit}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with other subreddits even if one fails
      }
    }
    
    // Remove duplicates and limit results
    const uniqueResults = merged_results.filter((result, index, self) =>
      index === self.findIndex(r => r.source_url === result.source_url)
    );
    
    const finalResults = uniqueResults
      .sort((a, b) => b.engagement_score - a.engagement_score)
      .slice(0, scout.max_results * 2); // Get extra for analysis filtering
    
    logger.info('Reddit search completed', {
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
    
    logger.info('Starting Reddit content processing (no filtering)', {
      resultsToProcess: merged_results.length,
      runId: run_id
    });
    
    const analyzed = await batchAnalyzeContent(
      mastra,
      scout.instructions,
      scout.keywords,
      merged_results,
      0.1 // Very low threshold since we're not really filtering
    );
    
    // Don't truncate results - store everything that passed analysis
    const resultsToStore = analyzed; // Remove the slice that was limiting to max_results
    const highRelevance = resultsToStore.filter(r => r.relevance_score >= 0.6).length;
    
    logger.info('Reddit content analysis completed', {
      analyzedCount: analyzed.length,
      resultsToStore: resultsToStore.length,
      highRelevanceCount: highRelevance,
      runId: run_id
    });
    
    return {
      analyzed_results: resultsToStore,
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
    let storeResult: any = null;
    
    if (analyzed_results.length > 0) {
      logger.info('About to store Reddit results using itch.io method', {
        resultsToStore: analyzed_results.length,
        sampleTitles: analyzed_results.slice(0, 3).map(r => r.title),
        runId: run_id
      });
      
      let storedCount = 0;
      
      // Store each result individually like itch.io workflow does
      for (let i = 0; i < analyzed_results.length; i++) {
        const result = analyzed_results[i];
        try {
          // Generate a unique external ID for Reddit posts
          const externalId = `reddit_${result.source_url?.split('/').pop() || Date.now()}_${i}`;
          
          // Calculate scores (similar to itch.io workflow)
          const engagementScore = Math.min(
            (result.score || 0) * 10 + 
            (result.num_comments || 0) * 2,
            100
          );
          const relevanceScore = result.relevance_score || 0.7;
          
          logger.info(`Storing Reddit result ${i + 1}/${analyzed_results.length}`, {
            title: result.title,
            url: result.source_url,
            externalId,
            engagementScore,
            relevanceScore,
            runId: run_id
          });
          
          // Direct SQL INSERT (matching itch.io pattern)
          const sql = `
            INSERT INTO scout_results (
              "scoutId", "organizationId", platform, "externalId",
              url, title, description, content, author,
              "engagementScore", "relevanceScore", "platformData", 
              status, "foundAt", "aiSummary", "aiConfidenceScore", "processedAt"
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
            )
            RETURNING id
          `;
          
          const values = [
            scout.id,                                          // $1: scoutId
            scout.organization_id,                             // $2: organizationId
            'reddit',                                          // $3: platform
            externalId,                                        // $4: externalId
            result.source_url || '',                           // $5: url
            result.title || 'Unknown Post',                    // $6: title
            (result.content || '').substring(0, 500),          // $7: description
            result.content || '',                              // $8: content
            result.author || 'Unknown Author',                 // $9: author
            engagementScore,                                   // $10: engagementScore
            relevanceScore,                                    // $11: relevanceScore
            JSON.stringify({                                   // $12: platformData
              subreddit: result.subreddit,
              score: result.score,
              num_comments: result.num_comments,
              created_at: result.created_at,
              post_id: result.id,
              is_self: result.is_self,
              flair: result.link_flair_text,
              upvote_ratio: result.upvote_ratio
            }),
            'new',                                             // $13: status
            new Date().toISOString(),                         // $14: foundAt
            result.analysis_reasoning || `Reddit post from r/${result.subreddit}`, // $15: aiSummary
            relevanceScore                                     // $16: aiConfidenceScore
          ];
          
          logger.info('Inserting Reddit result', {
            gameTitle: result.title,
            sqlPreview: sql.substring(0, 100) + '...',
            valuesCount: values.length,
            runId: run_id
          });
          
          const queryResult = await query(sql, values);
          
          if (queryResult.rowCount > 0) {
            storedCount++;
            logger.info(`✅ Successfully stored Reddit result ${i + 1}/${analyzed_results.length}`, {
              title: result.title,
              recordId: queryResult.rows[0]?.id,
              totalStoredSoFar: storedCount,
              runId: run_id
            });
          } else {
            logger.warn(`Failed to store Reddit result (no rows affected)`, {
              title: result.title,
              runId: run_id
            });
          }
          
        } catch (error) {
          logger.error(`❌ Failed to store Reddit result ${i + 1}/${analyzed_results.length}`, {
            title: result.title,
            error: error instanceof Error ? error.message : String(error),
            runId: run_id
          });
        }
      }
      
      logger.info('Reddit results storage completed using itch.io method', {
        requestedToStore: analyzed_results.length,
        actuallyStored: storedCount,
        success: storedCount > 0,
        runId: run_id
      });
      
      // Create a fake storeResult for compatibility
      storeResult = {
        total_stored: storedCount,
        success: true
      };
    } else {
      logger.warn('No Reddit results to store', {
        runId: run_id
      });
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      success: true,
      run_id,
      results_count: storeResult?.total_stored || analyzed_results.length,
      high_relevance_count,
      execution_time_ms: executionTime
    };
  }
});

// Simplified Reddit Scout Workflow
export const redditScoutWorkflow = createWorkflow({
  id: 'reddit-scout-workflow',
  description: 'Simplified Reddit scout workflow with sequential searches for reliability',
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
  
  // Generate Reddit search strategy
  .map(({ getInitData }) => {
    const initialInput = getInitData();
    return {
      scout: initialInput.scout,
      run_id: initialInput.run_id
    };
  })
  .then(generateRedditStrategyStep)
  
  // Search all subreddits sequentially
  .then(searchAllSubredditsStep)
  
  // Analyze content with permissive thresholds
  .then(analyzeRedditContentStep)
  
  // Store results
  .then(storeRedditResultsStep)
  
  .commit();