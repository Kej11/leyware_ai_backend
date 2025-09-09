import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { GameListing, InvestigationDecision } from '../database/schemas';
import { Mastra } from '@mastra/core';

export const investigationDecisionAgent = new Agent({
  name: 'InvestigationDecisionAgent',
  description: 'Intelligently decides which games deserve detailed investigation based on scout criteria',
  instructions: `You are an expert game scout that makes smart decisions about which games to investigate further.

    Your job is to analyze initial game listings and decide which ones deserve detailed scraping based on the scout's mission and criteria.

    EVALUATION CRITERIA:
    1. **Title Relevance** (40%): How well does the game title align with scout keywords and mission?
    2. **Developer Quality** (20%): Does the developer name suggest quality/reputation?
    3. **Description Match** (25%): Does the brief description match what the scout is looking for?
    4. **Genre Alignment** (10%): Does the genre fit the scout's interests?
    5. **Price Point** (5%): Is the pricing appropriate for the scout's criteria?

    SCORING GUIDELINES:
    - 0.9-1.0: Perfect match - must investigate (high-priority indie gems, exactly matching criteria)
    - 0.7-0.8: Strong match - should investigate (good potential, multiple positive signals)
    - 0.5-0.6: Moderate match - maybe investigate if capacity allows
    - 0.3-0.4: Weak match - probably skip unless very specific criteria met
    - 0.0-0.2: Poor match - definitely skip

    DECISION STRATEGY:
    - Be selective but not too restrictive - aim for top 30-50% of games
    - Prioritize unique/innovative games over generic ones
    - Consider developer engagement potential (responsive to community)
    - Look for signs of active development/updates
    - Prefer games with meaningful descriptions over generic ones

    Always provide clear reasoning for each decision.`,
  model: google('gemini-2.5-pro')
});

export async function decideInvestigation(
  mastra: Mastra,
  scoutInstructions: string,
  scoutKeywords: string[],
  gameListings: GameListing[],
  maxInvestigations?: number
): Promise<InvestigationDecision[]> {
  
  const logger = mastra.getLogger();
  
  if (gameListings.length === 0) {
    logger.info('No game listings to process for investigation decisions');
    return [];
  }

  logger.info('Making investigation decisions', {
    gameCount: gameListings.length,
    maxInvestigations,
    stage: 'investigation-decision'
  });
  
  const prompt = `SCOUT MISSION: ${scoutInstructions}

TARGET KEYWORDS: ${scoutKeywords.join(', ')}

${maxInvestigations ? `INVESTIGATION LIMIT: Select up to ${maxInvestigations} games for detailed investigation.` : ''}

GAMES TO EVALUATE:
${gameListings.map((game, index) => `
${index + 1}. "${game.title}" by ${game.developer}
   - URL: ${game.url}
   - Price: ${game.price || 'Unknown'}
   - Genre: ${game.genre || 'Unknown'}
   - Description: ${game.description || 'No description'}
`).join('')}

For each game, decide whether it deserves detailed investigation (including comment scraping) based on how well it matches the scout mission. Consider:

1. Does the title/genre align with the mission keywords?
2. Does the description suggest this is what the scout is looking for?
3. Does the developer seem legitimate/quality?
4. Is the price point reasonable for the target audience?
5. Does this game have potential for community engagement?

${maxInvestigations ? `
IMPORTANT: You must select exactly the ${maxInvestigations} most promising games. Be selective - only choose games that truly deserve the additional scraping cost and time.
` : ''}

Return your decisions with scores and detailed reasoning for each game.`;

  const decisionsSchema = z.object({
    decisions: z.array(z.object({
      gameUrl: z.string().describe('The URL of the game'),
      gameTitle: z.string().describe('The title of the game'),
      shouldInvestigate: z.boolean().describe('Whether this game should be investigated further'),
      score: z.number().min(0).max(1).describe('Investigation priority score (0-1)'),
      reasoning: z.string().describe('Detailed explanation for this decision')
    }))
  });

  try {
    const response = await investigationDecisionAgent.generate(prompt, {
      experimental_output: decisionsSchema
    });

    if (!response.object?.decisions) {
      logger.warn('Investigation agent returned no decisions, using fallback logic', {
        gameCount: gameListings.length,
        maxInvestigations
      });
      // Fallback: investigate games with meaningful descriptions
      return gameListings.map(game => ({
        gameUrl: game.url,
        gameTitle: game.title,
        shouldInvestigate: (game.description && game.description.length > 20) || false,
        score: 0.5,
        reasoning: 'Fallback decision - agent analysis failed'
      }));
    }

    const decisions = response.object.decisions;
    
    // Sort by score descending and apply limit if specified
    const sortedDecisions = decisions.sort((a, b) => b.score - a.score);
    
    if (maxInvestigations && maxInvestigations > 0) {
      // Mark top N as investigate, rest as skip
      sortedDecisions.forEach((decision, index) => {
        if (index >= maxInvestigations) {
          decision.shouldInvestigate = false;
          decision.reasoning = `${decision.reasoning} [SKIPPED: Exceeded investigation limit]`;
        }
      });
    }

    const investigateCount = sortedDecisions.filter(d => d.shouldInvestigate).length;
    const avgScore = sortedDecisions.reduce((sum, d) => sum + d.score, 0) / sortedDecisions.length;
    
    logger.info('Investigation decisions completed', {
      selectedCount: investigateCount,
      totalCount: gameListings.length,
      averageScore: parseFloat(avgScore.toFixed(2)),
      maxInvestigations,
      selectionRate: parseFloat((investigateCount / gameListings.length * 100).toFixed(1))
    });
    
    return sortedDecisions;

  } catch (error) {
    logger.error('Error in investigation decision agent', {
      error: error instanceof Error ? error.message : String(error),
      gameCount: gameListings.length,
      maxInvestigations
    });
    
    // Fallback strategy: investigate top games by description length/quality
    const fallbackDecisions = gameListings.map(game => {
      const hasGoodDescription = game.description && game.description.length > 30;
      const hasPriceInfo = game.price && game.price !== 'Unknown';
      const score = (hasGoodDescription ? 0.6 : 0.3) + (hasPriceInfo ? 0.1 : 0);
      
      return {
        gameUrl: game.url,
        gameTitle: game.title,
        shouldInvestigate: hasGoodDescription,
        score,
        reasoning: 'Fallback decision - based on description quality'
      };
    });

    return fallbackDecisions.sort((a, b) => b.score - a.score);
  }
}

export async function batchInvestigationDecisions(
  mastra: Mastra,
  scoutInstructions: string,
  scoutKeywords: string[],
  gameListings: GameListing[],
  batchSize: number = 10,
  maxInvestigations?: number
): Promise<InvestigationDecision[]> {
  
  const logger = mastra.getLogger();
  
  if (gameListings.length <= batchSize) {
    return decideInvestigation(mastra, scoutInstructions, scoutKeywords, gameListings, maxInvestigations);
  }

  logger.info('Processing games for investigation decisions in batches', {
    totalGames: gameListings.length,
    batchSize,
    totalBatches: Math.ceil(gameListings.length / batchSize),
    maxInvestigations
  });
  
  const allDecisions: InvestigationDecision[] = [];
  
  for (let i = 0; i < gameListings.length; i += batchSize) {
    const batch = gameListings.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(gameListings.length / batchSize);
    
    logger.info('Processing investigation batch', {
      batchNumber: currentBatch,
      totalBatches,
      batchSize: batch.length,
      startIndex: i
    });
    
    const batchDecisions = await decideInvestigation(
      mastra,
      scoutInstructions, 
      scoutKeywords, 
      batch,
      undefined // Don't apply limit per batch
    );
    
    allDecisions.push(...batchDecisions);
    
    // Small delay between batches to avoid overwhelming the API
    if (i + batchSize < gameListings.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Apply global limit and sorting
  const sortedDecisions = allDecisions.sort((a, b) => b.score - a.score);
  
  if (maxInvestigations && maxInvestigations > 0) {
    sortedDecisions.forEach((decision, index) => {
      if (index >= maxInvestigations) {
        decision.shouldInvestigate = false;
        decision.reasoning = `${decision.reasoning} [SKIPPED: Exceeded global investigation limit]`;
      }
    });
  }
  
  const finalInvestigateCount = sortedDecisions.filter(d => d.shouldInvestigate).length;
  
  logger.info('Batch investigation decisions completed', {
    selectedCount: finalInvestigateCount,
    totalCount: gameListings.length,
    selectionRate: parseFloat((finalInvestigateCount / gameListings.length * 100).toFixed(1)),
    maxInvestigations
  });
  
  return sortedDecisions;
}