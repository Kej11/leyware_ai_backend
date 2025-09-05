import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export const searchPlanningAgent = new Agent({
  name: 'SearchPlanningAgent',
  description: 'Generates optimal search strategies for content discovery',
  instructions: `You are an expert at planning searches for gaming content across different platforms.
    
    Given scout instructions and keywords, generate an optimal search strategy.
    
    For Reddit:
    - Identify the most relevant subreddits for the topic
    - Expand keywords intelligently based on gaming terminology
    - Choose appropriate time filters based on the scout's frequency
    - Recommend sort options (top for quality, new for freshness)
    
    Be specific and thoughtful in your strategy. Consider:
    - Gaming genre and community preferences
    - Platform-specific terminology
    - Search volume vs. quality trade-offs
    
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

  const prompt = `SCOUT INSTRUCTIONS: ${instructions}
INITIAL KEYWORDS: ${keywords.join(', ')}
PLATFORM: ${platform}
SCOUT FREQUENCY: ${frequency} (search top posts from ${timeframeMap[frequency] || 'week'})

Generate an optimal ${platform} search strategy. ${
    platform === 'reddit' 
      ? 'Identify 3-5 highly relevant subreddits and expand keywords.'
      : 'Generate appropriate search parameters for the platform.'
  }`;

  const response = await searchPlanningAgent.generate(prompt, {
    experimental_output: z.object({
      platform: z.string(),
      search_params: z.object({
        subreddits: platform === 'reddit' ? z.array(z.string()) : z.array(z.string()).optional(),
        keywords: z.array(z.string()),
        time_filter: z.string(),
        sort: z.string(),
        limit: z.number()
      }),
      expanded_keywords: z.array(z.string()),
      reasoning: z.string()
    })
  });

  if (!response.object) {
    throw new Error('Failed to generate search strategy');
  }

  return response.object;
}