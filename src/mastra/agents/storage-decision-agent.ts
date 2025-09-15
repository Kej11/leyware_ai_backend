import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { DetailedGame, StorageDecision } from '../database/schemas';
import { Mastra } from '@mastra/core';

export const storageDecisionAgent = new Agent({
  name: 'StorageDecisionAgent',
  description: 'Makes final decisions on which games to save to the database based on comprehensive analysis',
  instructions: `You are an expert game curator making final decisions about which games deserve to be stored in the database.

    You have access to comprehensive game data including community feedback, developer engagement, and detailed game information.

    EVALUATION CRITERIA:
    1. **Mission Alignment** (30%): How perfectly does this game match the scout's original mission?
    2. **Community Engagement** (25%): Quality and quantity of community feedback, comments, ratings
    3. **Developer Activity** (20%): Is the developer responsive to community, actively updating?
    4. **Game Quality Indicators** (15%): Overall polish, ratings, meaningful content
    5. **Uniqueness/Value** (10%): Does this game offer something special or noteworthy?

    COMMUNITY SIGNALS TO CONSIDER:
    - High comment count indicates engaged community
    - Developer replies show active support
    - Recent comments suggest ongoing relevance
    - Positive sentiment in comments
    - Constructive feedback and bug reports (shows people care)
    - Feature requests and suggestions (shows engagement)

    QUALITY INDICATORS:
    - Detailed descriptions (not generic)
    - Multiple screenshots
    - Clear genre categorization
    - Recent updates/release dates
    - Reasonable file sizes
    - Professional presentation

    SCORING GUIDELINES (adjusted for indie game discovery):
    - 0.8-1.0: Exceptional find - perfect indie game or publishing opportunity
    - 0.6-0.7: Excellent - strong indie game content worth storing
    - 0.4-0.5: Good - relevant indie gaming content, store for potential
    - 0.3-0.4: Decent - gaming-related, may have some value
    - 0.2-0.3: Marginal - tangentially relevant
    - 0.0-0.2: Below threshold - not relevant to indie gaming

    STORAGE PHILOSOPHY (for indie game discovery):
    - Inclusivity over exclusivity - capture potential opportunities
    - Prioritize indie developers and solo creators
    - Value games seeking publishing or investment opportunities
    - Look for innovative or unique concepts, even if early-stage
    - Consider potential for growth and development
    - Store games that could benefit from publishing support

    Always provide detailed reasoning including specific evidence from the game data.`,
  model: google('gemini-2.5-pro')
});

function analyzeSentiment(comments: Array<{ content: string; isDevReply?: boolean }>): string {
  if (!comments || comments.length === 0) return 'neutral';
  
  const positiveWords = ['great', 'awesome', 'love', 'amazing', 'excellent', 'perfect', 'fantastic', 'wonderful', 'good', 'fun', 'enjoy', 'like'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'broken', 'bug', 'crash', 'horrible', 'worst', 'sucks', 'disappointed'];
  
  let positiveScore = 0;
  let negativeScore = 0;
  let totalWords = 0;
  
  comments.forEach(comment => {
    const words = comment.content.toLowerCase().split(/\s+/);
    totalWords += words.length;
    
    words.forEach(word => {
      if (positiveWords.some(pw => word.includes(pw))) positiveScore++;
      if (negativeWords.some(nw => word.includes(nw))) negativeScore++;
    });
  });
  
  const posRatio = positiveScore / totalWords;
  const negRatio = negativeScore / totalWords;
  
  if (posRatio > negRatio * 1.5) return 'positive';
  if (negRatio > posRatio * 1.5) return 'negative';
  if (posRatio > 0 && negRatio > 0) return 'mixed';
  return 'neutral';
}

export async function decideStorage(
  mastra: Mastra,
  scoutInstructions: string,
  scoutKeywords: string[],
  detailedGames: DetailedGame[],
  qualityThreshold: number = 0.4
): Promise<StorageDecision[]> {
  
  const logger = mastra.getLogger();
  
  if (detailedGames.length === 0) {
    logger.info('No detailed games to process for storage decisions');
    return [];
  }

  logger.info('Making storage decisions', {
    gameCount: detailedGames.length,
    qualityThreshold,
    stage: 'storage-decision'
  });
  
  const prompt = `SCOUT MISSION: ${scoutInstructions}

TARGET KEYWORDS: ${scoutKeywords.join(', ')}

QUALITY THRESHOLD: Games must score ${qualityThreshold} or higher to be stored.

DETAILED GAMES TO EVALUATE:
${detailedGames.map((game, index) => {
  const sentiment = game.comments ? analyzeSentiment(game.comments) : 'neutral';
  const devReplies = game.comments?.filter(c => c.isDevReply).length || 0;
  
  return `
${index + 1}. "${game.title}" by ${game.developer}
   - URL: ${game.url}
   - Price: ${game.price || 'Unknown'}
   - Genre: ${game.genre || 'Unknown'}
   - Rating: ${game.rating || 'No rating'}
   - Platforms: ${game.platforms?.join(', ') || 'Unknown'}
   - Tags: ${game.tags?.join(', ') || 'None'}
   - Release Date: ${game.releaseDate || 'Unknown'}
   - File Size: ${game.fileSize || 'Unknown'}
   - Screenshots: ${game.screenshots?.length || 0}
   - Description: ${game.description || game.fullDescription || 'No description'}
   
   COMMUNITY ENGAGEMENT:
   - Total Comments: ${game.commentCount || game.comments?.length || 0}
   - Developer Replies: ${devReplies}
   - Comment Sentiment: ${sentiment}
   - Recent Comments: ${game.comments?.slice(0, 3).map(c => 
     `"${c.content.substring(0, 100)}..." (by ${c.author}${c.isDevReply ? ' - DEVELOPER' : ''})`
   ).join('; ') || 'None'}
`;
}).join('')}

For each game, make a final storage decision based on:

1. **Mission Alignment**: How well does this game match the scout's mission and keywords?
2. **Community Value**: Does this game have meaningful community engagement?
3. **Developer Support**: Is the developer actively engaged with the community?
4. **Quality Indicators**: Does this game show signs of quality and polish?
5. **Unique Value**: Does this game offer something special or noteworthy?

Consider the community comments carefully - they reveal a lot about game quality, developer responsiveness, and ongoing relevance.

Return detailed decisions with scores and comprehensive reasoning for each game.`;

  const decisionsSchema = z.object({
    decisions: z.array(z.object({
      gameUrl: z.string().describe('The URL of the game'),
      gameTitle: z.string().describe('The title of the game'),
      shouldStore: z.boolean().describe('Whether this game should be stored in the database'),
      score: z.number().min(0).max(1).describe('Storage quality score (0-1)'),
      reasoning: z.string().describe('Comprehensive explanation for this decision including specific evidence'),
      sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).describe('Overall community sentiment').optional()
    }))
  });

  try {
    const response = await storageDecisionAgent.generateVNext(prompt, {
      structuredOutput: {
        schema: decisionsSchema
      }
    });

    logger.info('Storage agent response received', {
      responseType: typeof response,
      responseKeys: response ? Object.keys(response) : [],
      hasDecisions: !!response?.decisions,
      responsePreview: JSON.stringify(response, null, 2).substring(0, 500)
    });

    if (!response?.decisions) {
      logger.warn('Storage agent returned no decisions, using fallback logic', {
        gameCount: detailedGames.length,
        qualityThreshold,
        response: response
      });
      
      // Fallback: store games with good engagement or high ratings
      return detailedGames.map(game => {
        const hasComments = (game.commentCount || game.comments?.length || 0) > 0;
        const hasDevReplies = game.comments?.some(c => c.isDevReply) || false;
        const hasGoodRating = game.rating && (game.rating.includes('4.') || game.rating.includes('5.'));
        const hasRecentActivity = game.comments?.some(c => 
          c.date && (c.date.includes('hour') || c.date.includes('day'))
        ) || false;
        
        let score = 0.5;
        if (hasComments) score += 0.2;
        if (hasDevReplies) score += 0.2;
        if (hasGoodRating) score += 0.1;
        if (hasRecentActivity) score += 0.1;
        
        return {
          gameUrl: game.url,
          gameTitle: game.title,
          shouldStore: score >= qualityThreshold,
          score,
          reasoning: 'Fallback decision - based on engagement metrics',
          sentiment: game.comments ? analyzeSentiment(game.comments) as any : 'neutral'
        };
      });
    }

    const decisions = response.decisions;
    
    // Apply quality threshold
    decisions.forEach(decision => {
      if (decision.score < qualityThreshold) {
        decision.shouldStore = false;
        decision.reasoning = `${decision.reasoning} [REJECTED: Score ${decision.score.toFixed(2)} below threshold ${qualityThreshold}]`;
      }
    });

    // Analyze sentiment for games without it
    decisions.forEach(decision => {
      if (!decision.sentiment) {
        const game = detailedGames.find(g => g.url === decision.gameUrl);
        if (game?.comments) {
          decision.sentiment = analyzeSentiment(game.comments) as any;
        }
      }
    });

    const storeCount = decisions.filter(d => d.shouldStore).length;
    const avgScore = decisions.reduce((sum, d) => sum + d.score, 0) / decisions.length;
    
    // Log quality breakdown
    const highQuality = decisions.filter(d => d.score >= 0.8).length;
    const mediumQuality = decisions.filter(d => d.score >= 0.6 && d.score < 0.8).length;
    const lowQuality = decisions.filter(d => d.score < 0.6).length;
    
    logger.info('Storage decisions completed', {
      selectedCount: storeCount,
      totalCount: detailedGames.length,
      averageScore: parseFloat(avgScore.toFixed(2)),
      qualityBreakdown: {
        high: highQuality,
        medium: mediumQuality,
        low: lowQuality
      },
      threshold: qualityThreshold
    });
    
    return decisions.sort((a, b) => b.score - a.score);

  } catch (error) {
    logger.error('Error in storage decision agent', {
      error: error instanceof Error ? error.message : String(error),
      gameCount: detailedGames.length,
      qualityThreshold
    });
    
    // Enhanced fallback with multiple criteria
    const fallbackDecisions = detailedGames.map(game => {
      let score = 0.4; // Base score
      let reasons = [];
      
      // Community engagement scoring
      const commentCount = game.commentCount || game.comments?.length || 0;
      if (commentCount > 10) {
        score += 0.3;
        reasons.push(`${commentCount} comments show strong engagement`);
      } else if (commentCount > 0) {
        score += 0.1;
        reasons.push(`${commentCount} comments`);
      }
      
      // Developer engagement
      const devReplies = game.comments?.filter(c => c.isDevReply).length || 0;
      if (devReplies > 0) {
        score += 0.2;
        reasons.push(`${devReplies} developer replies show active support`);
      }
      
      // Quality indicators
      if (game.rating && (game.rating.includes('4.') || game.rating.includes('5.'))) {
        score += 0.15;
        reasons.push('high rating');
      }
      
      if (game.screenshots && game.screenshots.length > 3) {
        score += 0.05;
        reasons.push('multiple screenshots');
      }
      
      if (game.tags && game.tags.length > 3) {
        score += 0.05;
        reasons.push('well categorized');
      }
      
      const sentiment = game.comments ? analyzeSentiment(game.comments) : 'neutral';
      if (sentiment === 'positive') {
        score += 0.1;
        reasons.push('positive community sentiment');
      }
      
      return {
        gameUrl: game.url,
        gameTitle: game.title,
        shouldStore: score >= qualityThreshold,
        score: Math.min(score, 1.0),
        reasoning: `Fallback analysis: ${reasons.join(', ') || 'basic criteria evaluation'}`,
        sentiment: sentiment as any
      };
    });

    return fallbackDecisions.sort((a, b) => b.score - a.score);
  }
}

export async function batchStorageDecisions(
  mastra: Mastra,
  scoutInstructions: string,
  scoutKeywords: string[],
  detailedGames: DetailedGame[],
  qualityThreshold: number = 0.4,
  batchSize: number = 5
): Promise<StorageDecision[]> {
  
  const logger = mastra.getLogger();
  
  if (detailedGames.length <= batchSize) {
    return decideStorage(mastra, scoutInstructions, scoutKeywords, detailedGames, qualityThreshold);
  }

  logger.info('Processing games for storage decisions in batches', {
    totalGames: detailedGames.length,
    batchSize,
    totalBatches: Math.ceil(detailedGames.length / batchSize),
    qualityThreshold
  });
  
  const allDecisions: StorageDecision[] = [];
  
  for (let i = 0; i < detailedGames.length; i += batchSize) {
    const batch = detailedGames.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(detailedGames.length / batchSize);
    
    logger.info('Processing storage batch', {
      batchNumber: currentBatch,
      totalBatches,
      batchSize: batch.length,
      startIndex: i
    });
    
    const batchDecisions = await decideStorage(
      mastra,
      scoutInstructions, 
      scoutKeywords, 
      batch, 
      qualityThreshold
    );
    
    allDecisions.push(...batchDecisions);
    
    // Delay between batches
    if (i + batchSize < detailedGames.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const finalStoreCount = allDecisions.filter(d => d.shouldStore).length;
  
  logger.info('Batch storage decisions completed', {
    approvedCount: finalStoreCount,
    totalCount: detailedGames.length,
    approvalRate: parseFloat((finalStoreCount / detailedGames.length * 100).toFixed(1))
  });
  
  return allDecisions.sort((a, b) => b.score - a.score);
}