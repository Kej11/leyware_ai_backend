import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export const searchPlanningAgent = new Agent({
  name: 'SearchPlanningAgent',
  description: 'Generates concise search strategies for discovering indie games seeking publishing investment',
  instructions: `Generate concise search parameters for indie game discovery.

    PLATFORMS: 
    - Reddit: Use subreddits IndieGaming, IndieGames, IndieDev, gamedev
    - Itch.io: Search for indie games needing publishing support (use platform name "itchio")
    - Steam: Target indie releases and early access games
    
    KEYWORDS: Expand to include "indie", "solo dev", "small team", "seeking publisher", "funding"
    
    Keep reasoning brief (1-2 sentences). Focus on structured output only.`,
  model: google('gemini-2.5-pro')
});

export async function generateSearchStrategy(
  instructions: string,
  keywords: string[],
  platform: string,
  frequency: string
): Promise<any> {
  const timeframeMap: Record<string, string> = {
    'daily': 'week',    // Use week for daily scouts to get more results
    'weekly': 'month',  // Use month for weekly scouts to get more results  
    'monthly': 'month'  // Keep month for monthly scouts
  };

  let platformSpecificInstructions = '';
  if (platform === 'reddit') {
    platformSpecificInstructions = `Use subreddits: IndieGaming, IndieGames, IndieDev, gamedev. Time filter: ${timeframeMap[frequency] || 'week'}. Sort: hot.`;
  } else if (platform === 'itchio' || platform === 'itch.io') {
    platformSpecificInstructions = 'Platform name must be "itchio". Select pages: games, new-and-popular, newest. Target indie developers.';
  } else if (platform === 'steam') {
    platformSpecificInstructions = 'Select pages: demos, recentlyreleased, newandtrending. Focus on indie releases.';
  }

  const prompt = `Generate search strategy for ${platform}.
Keywords: ${keywords.join(', ')}
Frequency: ${frequency}

${platformSpecificInstructions}

REQUIRED: Set platform field to "${platform === 'itch.io' ? 'itchio' : platform}". Keep reasoning under 2 sentences.`;

  let searchParamsSchema;
  
  if (platform === 'reddit') {
    searchParamsSchema = z.object({
      subreddits: z.array(z.string()),
      keywords: z.array(z.string()),
      time_filter: z.string(),
      sort: z.string(),
      limit: z.number()
    });
  } else if (platform === 'itchio' || platform === 'itch.io') {
    searchParamsSchema = z.object({
      pages: z.array(z.string()),
      keywords: z.array(z.string()),
      detailed: z.boolean().default(false),
      maxResults: z.number().default(25),
      qualityThreshold: z.number().default(0.4)
    });
  } else if (platform === 'steam') {
    searchParamsSchema = z.object({
      pages: z.array(z.string()),
      keywords: z.array(z.string()),
      detailed: z.boolean().default(false),
      maxResults: z.number().default(25),
      qualityThreshold: z.number().default(0.4)
    });
  } else {
    // Default schema
    searchParamsSchema = z.object({
      keywords: z.array(z.string()),
      limit: z.number().default(25)
    });
  }

  const response = await searchPlanningAgent.generateVNext(prompt, {
    structuredOutput: {
      schema: z.object({
        platform: z.string(),
        search_params: searchParamsSchema,
        expanded_keywords: z.array(z.string()),
        reasoning: z.string()
      })
    }
  });

  if (!response) {
    throw new Error('Failed to generate search strategy - no response from AI');
  }

  // Validate and fix required fields
  if (!response.platform) {
    response.platform = platform === 'itch.io' ? 'itchio' : platform;
  }
  
  if (!response.search_params) {
    if (platform === 'reddit') {
      response.search_params = { 
        subreddits: ['IndieGaming', 'IndieGames', 'IndieDev', 'gamedev'], 
        keywords: [...keywords, 'indie', 'solo dev', 'small team'], 
        time_filter: 'week', 
        sort: 'hot', 
        limit: 25 
      };
    } else if (platform === 'itchio' || platform === 'itch.io') {
      response.search_params = {
        pages: ['games', 'new-and-popular', 'newest'],
        keywords: [...keywords, 'indie', 'solo dev'],
        detailed: false,
        maxResults: 25,
        qualityThreshold: 0.4
      };
    } else {
      response.search_params = { keywords: keywords, limit: 25 };
    }
  }
  
  if (!response.expanded_keywords || response.expanded_keywords.length === 0) {
    response.expanded_keywords = keywords;
  }

  // Add scout instructions to strategy for use by intelligent search
  (response as any).instructions = instructions;

  return response;
}