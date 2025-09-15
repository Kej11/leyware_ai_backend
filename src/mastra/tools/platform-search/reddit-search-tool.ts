import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BasePlatformSearchTool } from './base-search-tool';
import { PlatformSearchResult, SearchStrategy } from '../../database/schemas';
import { getRedditClient } from './reddit-api-client';
import { RedditSearchParams, RedditPost } from './reddit-api-types';

export class RedditSearchTool extends BasePlatformSearchTool {
  platform = 'reddit';

  async search(strategy: SearchStrategy): Promise<PlatformSearchResult[]> {
    console.log('=== DEBUG: Reddit search input ===');
    console.log('Strategy:', JSON.stringify(strategy, null, 2));
    
    const { search_params } = strategy;
    
    if (!search_params) {
      throw new Error('Reddit search: Missing search_params in strategy');
    }
    
    const { subreddits, keywords, time_filter, sort, limit } = search_params;
    
    if (!subreddits || !Array.isArray(subreddits)) {
      throw new Error('Reddit search: Missing or invalid subreddits array in search_params');
    }
    
    if (!keywords || !Array.isArray(keywords)) {
      throw new Error('Reddit search: Missing or invalid keywords array in search_params');
    }
    
    const results: PlatformSearchResult[] = [];
    const client = getRedditClient();
    
    console.log(`🔍 Starting authenticated Reddit search across ${subreddits.length} subreddits...`);
    
    for (const subreddit of subreddits) {
      try {
        const searchQuery = keywords.join(' OR ');
        
        const searchParams: RedditSearchParams = {
          q: searchQuery,
          sort: sort === 'relevance' ? 'relevance' : sort as any,
          t: time_filter,
          limit: Math.min(limit, 100),
          restrict_sr: true
        };

        console.log(`🎯 Searching r/${subreddit} for: "${searchQuery}"`);
        
        const listing = await client.searchSubreddit(subreddit, searchParams);
        
        if (listing.data?.children) {
          let processedCount = 0;
          
          for (const child of listing.data.children) {
            const post: RedditPost = child.data;
            
            // Include both self posts and posts with content
            if (post.is_self || post.selftext || post.title) {
              results.push({
                platform: 'reddit',
                source_url: `https://reddit.com${post.permalink}`,
                title: post.title,
                content: this.normalizeContent(post.selftext || post.title),
                author: post.author,
                author_url: `https://reddit.com/u/${post.author}`,
                engagement_score: this.calculateEngagementScore({
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
              processedCount++;
            }
          }
          
          console.log(`✅ Found ${processedCount} posts in r/${subreddit}`);
        }
        
        // Reduced delay since we have higher rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Error searching r/${subreddit}:`, error);
        // Continue with other subreddits even if one fails
        continue;
      }
    }
    
    console.log(`🎉 Reddit search completed: ${results.length} total results`);
    return results;
  }

  validateConfig(config: any): boolean {
    return (
      config &&
      Array.isArray(config.target_subreddits) &&
      config.target_subreddits.length > 0
    );
  }

  protected calculateEngagementScore(metadata: any): number {
    const { score = 0, num_comments = 0, upvote_ratio = 0.5 } = metadata;
    
    const normalizedScore = Math.min(score / 100, 10);
    const normalizedComments = Math.min(num_comments / 50, 10);
    const ratioScore = upvote_ratio * 10;
    
    return Math.round(
      (normalizedScore * 0.4 + normalizedComments * 0.4 + ratioScore * 0.2) * 10
    );
  }
}

export const redditSearchTool = createTool({
  id: 'reddit-search',
  description: 'Search Reddit for content based on strategy',
  inputSchema: z.object({
    strategy: z.object({
      platform: z.literal('reddit'),
      search_params: z.object({
        subreddits: z.array(z.string()),
        keywords: z.array(z.string()),
        time_filter: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']),
        sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']),
        limit: z.number().min(1).max(100)
      }),
      expanded_keywords: z.array(z.string()),
      reasoning: z.string()
    })
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      platform: z.string(),
      source_url: z.string(),
      title: z.string(),
      content: z.string(),
      author: z.string(),
      author_url: z.string().optional(),
      engagement_score: z.number(),
      metadata: z.any(),
      created_at: z.string()
    })),
    total_searched: z.number()
  }),
  execute: async ({ context }) => {
    const tool = new RedditSearchTool();
    const results = await tool.search(context.strategy);
    
    return {
      results,
      total_searched: results.length
    };
  }
});