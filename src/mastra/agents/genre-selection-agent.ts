import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { ITCHIO_GENRES, GenreSelection, genreSelectionSchema } from '../tools/platform-search/itchio-types';

export const genreSelectionAgent = new Agent({
  name: 'GenreSelectionAgent',
  description: 'Analyzes scout instructions and selects the most relevant itch.io genres to search',
  instructions: `You are an expert game categorization specialist that analyzes scout missions and identifies the most relevant game genres to search on itch.io.

    Your job is to read the scout's mission and keywords, then select 1-3 genres that best match what they're looking for.

    AVAILABLE GENRES:
    - action: Fast-paced games with physical challenges
    - adventure: Story-driven exploration games
    - card-game: Card-based strategy and collection games
    - educational: Learning and educational games
    - fighting: Combat-focused competitive games
    - interactive-fiction: Text-based narrative experiences
    - platformer: Jump-and-run games with level progression
    - puzzle: Logic and problem-solving games
    - racing: Competitive racing and driving games
    - rhythm: Music and timing-based games
    - role-playing: Character progression and story RPGs
    - shooter: Combat games with projectile weapons
    - simulation: Realistic or life simulation games
    - sports: Sports and athletic competition games
    - strategy: Planning and tactics-focused games
    - survival: Resource management and survival gameplay
    - visual-novel: Story-driven narrative experiences with choices
    - other: Games that don't fit standard categories

    GENRE SELECTION CRITERIA:
    1. **Keyword Analysis** (40%): Direct genre mentions in keywords or instructions
    2. **Gameplay Context** (30%): Implied gameplay style from mission description
    3. **Thematic Alignment** (20%): Story/theme indicators
    4. **Audience/Purpose** (10%): Target audience or publishing goals

    CONFIDENCE SCORING:
    - 0.9-1.0: Explicit genre mention in instructions/keywords
    - 0.7-0.8: Strong gameplay/theme indicators for this genre
    - 0.5-0.6: Moderate match based on context clues
    - Below 0.5: Don't include - too speculative

    SELECTION STRATEGY:
    - Select 1-3 genres maximum (prioritize specificity)
    - Only include genres with confidence >= 0.5
    - If no specific genre identified, return empty array (will use default pages)
    - Prefer narrower genres over broad ones when confidence is high
    - Consider complementary genres (e.g., "puzzle-platformer" → both genres)

    EXAMPLES:
    - "Find cozy puzzle games" → puzzle (0.95)
    - "Story-driven indie RPGs" → role-playing (0.9), interactive-fiction (0.6)
    - "Fast-paced action platformers" → platformer (0.9), action (0.7)
    - "Indie games seeking publishing" → [no specific genre] (broad discovery)

    Always provide clear reasoning for each genre selection.`,
  model: google('gemini-2.5-flash')
});

export async function selectGenres(
  mastra: Mastra,
  scoutInstructions: string,
  scoutKeywords: string[]
): Promise<GenreSelection[]> {

  const logger = mastra.getLogger();

  logger.info('Analyzing scout mission for genre selection', {
    instructionsLength: scoutInstructions.length,
    keywordCount: scoutKeywords.length,
    stage: 'genre-selection'
  });

  const prompt = `SCOUT MISSION: ${scoutInstructions}

TARGET KEYWORDS: ${scoutKeywords.join(', ')}

AVAILABLE GENRES: ${ITCHIO_GENRES.join(', ')}

Based on this scout mission, which itch.io genres should we search to find the most relevant games?

Analyze the mission statement and keywords carefully. Look for:
- Explicit genre mentions (e.g., "platformer", "RPG", "puzzle")
- Gameplay descriptors (e.g., "story-driven" → visual-novel/interactive-fiction)
- Thematic keywords (e.g., "cozy" → puzzle/simulation, "fast-paced" → action/racing)
- Target audience indicators (e.g., "educational", "casual")

Select 1-3 genres with confidence >= 0.5. If the mission is broad (e.g., "find any indie games"), return an empty array to use default discovery pages.

Provide your genre selections with confidence scores and detailed reasoning.`;

  try {
    const response = await genreSelectionAgent.generateVNext(prompt, {
      structuredOutput: {
        schema: genreSelectionSchema
      }
    });

    logger.info('Genre selection agent response received', {
      responseType: typeof response,
      responseKeys: response ? Object.keys(response) : [],
      hasSelections: !!response?.selections,
      selectionsCount: response?.selections?.length || 0,
      rawResponsePreview: JSON.stringify(response).substring(0, 300)
    });

    // Handle different response structures from Mastra
    let selections = response?.selections;

    // Sometimes the response is wrapped in an 'object' field
    if (!selections && response?.object?.selections) {
      selections = response.object.selections;
      logger.info('Found selections in object.selections');
    }

    // Sometimes it's the direct array
    if (!selections && Array.isArray(response)) {
      selections = response;
      logger.info('Response is direct array');
    }

    if (!selections || selections.length === 0) {
      logger.info('No genre selections returned - using default pages', {
        scoutInstructions: scoutInstructions.substring(0, 100),
        responseStructure: response ? Object.keys(response) : 'null'
      });
      return [];
    }

    // Filter by confidence threshold and sort by confidence
    const validSelections = selections
      .filter((s: any) => s.confidence >= 0.5)
      .sort((a: any, b: any) => b.confidence - a.confidence)
      .slice(0, 3); // Max 3 genres

    if (validSelections.length === 0) {
      logger.info('No genres met confidence threshold - using default pages', {
        allSelections: response.selections.map(s => `${s.genre}: ${s.confidence}`)
      });
      return [];
    }

    logger.info('Genre selection completed', {
      selectedGenres: validSelections.map(s => s.genre),
      confidences: validSelections.map(s => s.confidence),
      avgConfidence: parseFloat((validSelections.reduce((sum, s) => sum + s.confidence, 0) / validSelections.length).toFixed(2))
    });

    return validSelections;

  } catch (error) {
    logger.error('Error in genre selection agent', {
      error: error instanceof Error ? error.message : String(error),
      scoutInstructions: scoutInstructions.substring(0, 100)
    });

    // Fallback: keyword-based genre detection
    logger.info('Falling back to keyword-based genre detection');
    return fallbackGenreSelection(scoutKeywords, logger);
  }
}

/**
 * Fallback genre selection using simple keyword matching
 */
function fallbackGenreSelection(keywords: string[], logger?: any): GenreSelection[] {
  const keywordText = keywords.join(' ').toLowerCase();
  const matches: GenreSelection[] = [];

  // Simple keyword → genre mapping
  const genreKeywords: Record<string, string[]> = {
    'action': ['action', 'fast-paced', 'combat', 'intense'],
    'adventure': ['adventure', 'exploration', 'quest'],
    'card-game': ['card', 'deck', 'tcg', 'ccg'],
    'educational': ['educational', 'learning', 'teach'],
    'fighting': ['fighting', 'fighter', 'combat', 'versus'],
    'interactive-fiction': ['text', 'narrative', 'choice', 'interactive fiction'],
    'platformer': ['platformer', 'platform', 'jump', 'runner'],
    'puzzle': ['puzzle', 'logic', 'brain', 'solve'],
    'racing': ['racing', 'race', 'driving', 'car'],
    'rhythm': ['rhythm', 'music', 'beat', 'dance'],
    'role-playing': ['rpg', 'role-playing', 'character', 'level up'],
    'shooter': ['shooter', 'shoot', 'fps', 'bullet hell'],
    'simulation': ['simulation', 'sim', 'realistic', 'management'],
    'sports': ['sports', 'soccer', 'basketball', 'football'],
    'strategy': ['strategy', 'tactics', 'rts', 'turn-based'],
    'survival': ['survival', 'craft', 'resource', 'survive'],
    'visual-novel': ['visual novel', 'vn', 'story', 'romance'],
    'other': []
  };

  for (const [genre, genreKws] of Object.entries(genreKeywords)) {
    for (const kw of genreKws) {
      if (keywordText.includes(kw)) {
        matches.push({
          genre: genre as any,
          confidence: 0.6,
          reasoning: `Fallback: Keyword match for "${kw}"`
        });
        break;
      }
    }
  }

  const topMatches = matches.slice(0, 2);

  logger?.info('Fallback genre selection completed', {
    matchedGenres: topMatches.map(m => m.genre),
    matchCount: topMatches.length
  });

  return topMatches;
}
