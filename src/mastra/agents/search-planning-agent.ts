import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export const searchPlanningAgent = new Agent({
  name: 'SearchPlanningAgent',
  description: 'Generates optimal search strategies for gaming content discovery across multiple platforms',
  instructions: `You are an expert at planning searches for gaming content across Reddit, itch.io, and Steam.
    
    Given scout instructions and keywords, generate an optimal search strategy for the specified platform.
    
    For Reddit:
    - Identify the most relevant subreddits for the topic
    - Expand keywords intelligently based on gaming terminology
    - Choose appropriate time filters based on the scout's frequency
    - Recommend sort options (top for quality, new for freshness)
    
    For Itch.io:
    - Select which pages to search: 'games', 'new-and-popular', 'newest'
    - Expand keywords to match indie game terminology and genres
    - Consider price filters (free, paid, name-your-own-price)
    - Focus on discovering creative and experimental games
    
    For Steam:
    - Select demo pages: 'demos', 'recentlyreleased', 'newandtrending'
    - Expand keywords to match Steam tags and genres
    - Consider review scores and platform preferences
    - Focus on finding high-quality game demos
    
    Be specific and thoughtful in your strategy. Consider:
    - Platform-specific discovery patterns
    - Gaming genre and community preferences
    - Search volume vs. quality trade-offs
    - Platform-specific terminology and tags
    
    Output a structured strategy with your reasoning.`,
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
    platformSpecificInstructions = `Identify 3-5 highly relevant subreddits and expand keywords. Use time filter: ${timeframeMap[frequency] || 'week'}`;
  } else if (platform === 'itchio') {
    platformSpecificInstructions = 'Select appropriate itch.io pages (games, new-and-popular, newest) and expand keywords for indie game discovery.';
  } else if (platform === 'steam') {
    platformSpecificInstructions = 'Select appropriate Steam demo pages (demos, recentlyreleased, newandtrending) and expand keywords for Steam tags/genres.';
  }

  const prompt = `SCOUT INSTRUCTIONS: ${instructions}
INITIAL KEYWORDS: ${keywords.join(', ')}
PLATFORM: ${platform}
SCOUT FREQUENCY: ${frequency}

Generate an optimal ${platform} search strategy. ${platformSpecificInstructions}`;

  let searchParamsSchema;
  
  if (platform === 'reddit') {
    searchParamsSchema = z.object({
      subreddits: z.array(z.string()),
      keywords: z.array(z.string()),
      time_filter: z.string(),
      sort: z.string(),
      limit: z.number()
    });
  } else if (platform === 'itchio') {
    searchParamsSchema = z.object({
      pages: z.array(z.string()),
      keywords: z.array(z.string()),
      detailed: z.boolean().default(false),
      maxResults: z.number().default(25),
      qualityThreshold: z.number().default(0.7)
    });
  } else if (platform === 'steam') {
    searchParamsSchema = z.object({
      pages: z.array(z.string()),
      keywords: z.array(z.string()),
      detailed: z.boolean().default(false),
      maxResults: z.number().default(25),
      qualityThreshold: z.number().default(0.7)
    });
  } else {
    // Default schema
    searchParamsSchema = z.object({
      keywords: z.array(z.string()),
      limit: z.number().default(25)
    });
  }

  const response = await searchPlanningAgent.generate(prompt, {
    experimental_output: z.object({
      platform: z.string(),
      search_params: searchParamsSchema,
      expanded_keywords: z.array(z.string()),
      reasoning: z.string()
    })
  });

  if (!response.object) {
    throw new Error('Failed to generate search strategy');
  }

  return response.object;
}