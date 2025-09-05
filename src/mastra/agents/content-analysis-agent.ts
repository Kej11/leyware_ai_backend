import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export const contentAnalysisAgent = new Agent({
  name: 'ContentAnalysisAgent',
  description: 'Analyzes content relevance to scout instructions',
  instructions: `You are an expert at analyzing gaming content relevance.
    
    Score each piece of content from 0.0 to 1.0 based on:
    - How well it matches the scout instructions
    - Content quality and informativeness
    - Engagement metrics (as a secondary factor)
    - Relevance to the specified keywords
    
    Be strict but fair in your scoring:
    - 0.9-1.0: Perfect match, highly relevant and valuable
    - 0.7-0.8: Good match, clearly relevant
    - 0.5-0.6: Moderate match, somewhat relevant
    - 0.3-0.4: Weak match, tangentially relevant
    - 0.0-0.2: Poor match, not relevant
    
    Provide brief reasoning for your score.`,
  model: google('gemini-2.5-pro')
});

export async function analyzeContentRelevance(
  instructions: string,
  keywords: string[],
  content: {
    title: string;
    content: string;
    metadata: any;
  }
): Promise<{ relevance_score: number; reasoning: string }> {
  const prompt = `SCOUT INSTRUCTIONS: ${instructions}
SCOUT KEYWORDS: ${keywords.join(', ')}

CONTENT TO ANALYZE:
Title: ${content.title}
Content: ${content.content.slice(0, 1000)}
Platform: ${content.metadata.subreddit ? `Reddit - r/${content.metadata.subreddit}` : 'Unknown'}
Engagement: Score: ${content.metadata.score || 0}, Comments: ${content.metadata.num_comments || 0}

Rate the relevance on a scale of 0.0 to 1.0 and provide brief reasoning.`;

  const response = await contentAnalysisAgent.generate(prompt, {
    experimental_output: z.object({
      relevance_score: z.number().min(0).max(1),
      reasoning: z.string()
    })
  });

  if (!response.object) {
    return { relevance_score: 0.5, reasoning: 'Analysis failed, using default score' };
  }

  return response.object;
}

export async function batchAnalyzeContent(
  instructions: string,
  keywords: string[],
  contents: Array<{
    title: string;
    content: string;
    metadata: any;
  }>,
  qualityThreshold: number = 0.7
): Promise<Array<any>> {
  const analyzed = [];
  
  for (const content of contents) {
    try {
      const analysis = await analyzeContentRelevance(instructions, keywords, content);
      
      if (analysis.relevance_score >= qualityThreshold) {
        analyzed.push({
          ...content,
          relevance_score: analysis.relevance_score,
          analysis_reasoning: analysis.reasoning
        });
      }
    } catch (error) {
      console.error('Content analysis error:', error);
      if (content.metadata.score && content.metadata.score > 10) {
        analyzed.push({
          ...content,
          relevance_score: 0.5,
          analysis_reasoning: 'Fallback score due to analysis error'
        });
      }
    }
  }
  
  return analyzed.sort((a, b) => b.relevance_score - a.relevance_score);
}