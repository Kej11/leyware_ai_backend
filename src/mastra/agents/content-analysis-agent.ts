import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { Mastra } from '@mastra/core';

export const contentAnalysisAgent = new Agent({
  name: 'ContentAnalysisAgent',
  description: 'Analyzes content relevance to scout instructions',
  instructions: `You are an expert at analyzing gaming content relevance, particularly for discovering indie games and developers seeking publishing opportunities.
    
    Score each piece of content from 0.0 to 1.0 based on:
    - How well it matches the scout instructions (prioritize indie games, publishing opportunities)
    - Content quality and informativeness (be VERY generous for indie developers)
    - Engagement metrics (as a secondary factor)
    - Relevance to the specified keywords
    
    Be EXTREMELY encouraging and inclusive in your scoring for indie game discovery:
    - 0.7-1.0: Any indie game content, dev posts, showcases, or publishing discussions
    - 0.5-0.6: General gaming content that could lead to indie game discovery
    - 0.3-0.4: Gaming-adjacent content worth preserving
    - 0.1-0.2: Minimally gaming-related content
    - 0.0: Completely unrelated to gaming
    
    CRITICAL: Default to INCLUSION rather than exclusion. If there's ANY possibility this could be relevant to indie game discovery, score it 0.5 or higher. Even simple screenshots, early prototypes, or basic dev questions are valuable.
    
    Give extra points for:
    - Any mention of indie games, solo development, small teams
    - Game showcases, screenshots, or demos
    - Developer seeking feedback or publishing help
    - Gaming community discussions
    
    Provide brief reasoning for your score.`,
  model: google('gemini-2.5-pro')
});

export async function analyzeContentRelevance(
  mastra: Mastra,
  instructions: string,
  keywords: string[],
  content: {
    title: string;
    content: string;
    metadata: any;
  }
): Promise<{ relevance_score: number; reasoning: string }> {
  // Extract platform-specific engagement metrics
  let platformDisplay = 'Unknown';
  let engagementDisplay = 'No engagement data';
  
  if (content.metadata?.subreddit) {
    // Reddit content
    platformDisplay = `Reddit - r/${content.metadata.subreddit}`;
    engagementDisplay = `Score: ${content.metadata.score || 0}, Comments: ${content.metadata.num_comments || 0}`;
  } else if ((content as any).platform === 'itchio') {
    // Itch.io content 
    platformDisplay = 'Itch.io';
    const downloads = content.metadata?.downloads || content.metadata?.download_count || '0';
    const rating = content.metadata?.rating || 'No rating';
    const comments = content.metadata?.comment_count || content.metadata?.comments?.length || 0;
    engagementDisplay = `Downloads: ${downloads}, Rating: ${rating}, Comments: ${comments}`;
  } else if ((content as any).platform) {
    // Generic platform detection
    platformDisplay = (content as any).platform;
    engagementDisplay = `Engagement score: ${(content as any).engagement_score || 0}`;
  }

  const prompt = `SCOUT INSTRUCTIONS: ${instructions}
SCOUT KEYWORDS: ${keywords.join(', ')}

CONTENT TO ANALYZE:
Title: ${content.title}
Content: ${content.content.slice(0, 1000)}
Platform: ${platformDisplay}
Engagement: ${engagementDisplay}

Rate the relevance on a scale of 0.0 to 1.0 and provide brief reasoning.`;

  const response = await contentAnalysisAgent.generateVNext(prompt, {
    structuredOutput: {
      schema: z.object({
        relevance_score: z.number().min(0).max(1),
        reasoning: z.string()
      })
    }
  });

  const logger = mastra.getLogger();
  
  if (!response || typeof response !== 'object' || !('relevance_score' in response)) {
    logger.warn('Content analysis failed, using default score', {
      contentTitle: content.title,
      platform: platformDisplay,
      response: response
    });
    return { relevance_score: 0.5, reasoning: 'Analysis failed, using default score' };
  }

  const result = response as { relevance_score: number; reasoning: string };

  logger.info('Content analysis completed', {
    contentTitle: content.title,
    relevanceScore: result.relevance_score,
    reasoning: result.reasoning,
    platform: platformDisplay,
    engagement: engagementDisplay,
    rawResponse: response
  });

  return result;
}

export async function batchAnalyzeContent(
  mastra: Mastra,
  instructions: string,
  keywords: string[],
  contents: Array<{
    title: string;
    content: string;
    metadata: any;
  }>,
  qualityThreshold: number = 0.4
): Promise<Array<any>> {
  const logger = mastra.getLogger();
  const analyzed = [];
  
  logger.info('Starting batch content analysis', {
    totalContent: contents.length,
    qualityThreshold
  });
  
  // SIMPLIFIED: Just save everything without filtering
  logger.warn('SIMPLIFIED MODE: Saving all content without filtering', {
    totalContent: contents.length
  });
  
  const processed = contents.map(content => ({
    ...content,
    relevance_score: 0.7, // Fixed score above threshold to ensure saving
    analysis_reasoning: 'SIMPLIFIED MODE: All content auto-approved'
  }));
  
  const highRelevanceCount = processed.filter(a => a.relevance_score >= 0.6).length;
  
  logger.info('Batch content analysis completed', {
    analyzedCount: processed.length,
    totalProcessed: contents.length,
    passedThreshold: processed.length,
    highRelevanceCount,
    averageScore: 0.7
  });
  
  return processed;
}