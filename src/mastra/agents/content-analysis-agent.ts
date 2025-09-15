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
    - Content quality and informativeness (be generous for indie developers)
    - Engagement metrics (as a secondary factor)
    - Relevance to the specified keywords
    
    Be encouraging and inclusive in your scoring for indie game discovery:
    - 0.8-1.0: Excellent match, clearly relevant indie game content
    - 0.6-0.7: Good match, relevant to indie gaming or development
    - 0.4-0.5: Moderate match, gaming-related content worth keeping
    - 0.2-0.3: Weak match, tangentially relevant to gaming
    - 0.0-0.1: Not relevant to gaming or development
    
    IMPORTANT: Err on the side of inclusion for indie games, solo developers, and publishing-related content. Even simple or early-stage games may be valuable discoveries.
    
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
  
  if (!response) {
    logger.warn('Content analysis failed, using default score', {
      contentTitle: content.title,
      platform: platformDisplay
    });
    return { relevance_score: 0.5, reasoning: 'Analysis failed, using default score' };
  }

  logger.info('Content analysis completed', {
    contentTitle: content.title,
    relevanceScore: response.relevance_score,
    reasoning: response.reasoning,
    platform: platformDisplay,
    engagement: engagementDisplay,
    rawResponse: response
  });

  return response;
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
  
  // TEMPORARY: Bypass mode to save everything for debugging
  const BYPASS_AI_ANALYSIS = process.env.BYPASS_AI_ANALYSIS === 'true';
  
  if (BYPASS_AI_ANALYSIS) {
    logger.warn('BYPASS MODE: Saving all content without AI analysis', {
      totalContent: contents.length
    });
    
    return contents.map(content => ({
      ...content,
      relevance_score: 0.8, // High score to ensure saving
      analysis_reasoning: 'BYPASS MODE: Auto-approved for debugging'
    }));
  }
  
  for (const content of contents) {
    try {
      const analysis = await analyzeContentRelevance(mastra, instructions, keywords, content);
      
      logger.info('Threshold comparison', {
        contentTitle: content.title,
        relevanceScore: analysis.relevance_score,
        qualityThreshold: qualityThreshold,
        passed: analysis.relevance_score >= qualityThreshold,
        reasoning: analysis.reasoning
      });
      
      if (analysis.relevance_score >= qualityThreshold) {
        analyzed.push({
          ...content,
          relevance_score: analysis.relevance_score,
          analysis_reasoning: analysis.reasoning
        });
      }
    } catch (error) {
      // Re-extract platform for error logging
      const errorPlatform = content.metadata?.subreddit ? `Reddit - r/${content.metadata.subreddit}` : 
                          (content as any).platform || 'Unknown';
      
      logger.error('Content analysis error', {
        error: error instanceof Error ? error.message : String(error),
        contentTitle: content.title,
        platform: errorPlatform
      });
      
      if (content.metadata.score && content.metadata.score > 10) {
        analyzed.push({
          ...content,
          relevance_score: 0.5,
          analysis_reasoning: 'Fallback score due to analysis error'
        });
      }
    }
  }
  
  const highRelevanceCount = analyzed.filter(a => a.relevance_score >= 0.8).length;
  
  logger.info('Batch content analysis completed', {
    analyzedCount: analyzed.length,
    totalProcessed: contents.length,
    passedThreshold: analyzed.length,
    highRelevanceCount,
    averageScore: analyzed.length > 0 ? parseFloat((analyzed.reduce((sum, a) => sum + a.relevance_score, 0) / analyzed.length).toFixed(2)) : 0
  });
  
  return analyzed.sort((a, b) => b.relevance_score - a.relevance_score);
}