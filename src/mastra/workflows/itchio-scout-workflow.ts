import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { query, execute } from '../database/neon-client';
import {
  updateRunStatusTool,
  updateRunProgressTool
} from '../tools/database-tools';
import { ItchioSearchTool } from '../tools/platform-search/itchio-search-tool';
import { GameListing, DetailedGame } from '../../database/schemas';

const updateRunStatusStep = createStep(updateRunStatusTool);
const updateRunProgressStep = createStep(updateRunProgressTool);

// Input/Output schemas
const scoutInputSchema = z.object({
  scout: z.object({
    id: z.string(),
    name: z.string(),
    instructions: z.string(),
    keywords: z.array(z.string()),
    platform: z.string(),
    max_results: z.number(),
    quality_threshold: z.number(),
    frequency: z.string(),
    organization_id: z.string()
  }),
  run_id: z.string()
});

const resultsSchema = z.object({
  success: z.boolean(),
  run_id: z.string(),
  results_count: z.number(),
  high_relevance_count: z.number(),
  execution_time_ms: z.number()
});

// Step 1: Scrape game listings from the two specified pages
const scrapeGameListingsStep = createStep({
  id: 'scrape-game-listings',
  description: 'Scrape game listings from itch.io pages',
  inputSchema: scoutInputSchema,
  outputSchema: z.object({
    listings: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { scout, run_id } = inputData;
    const logger = mastra.getLogger();
    
    logger.info('=== STEP 1: Starting game listings scrape ===', {
      runId: run_id,
      scoutName: scout.name
    });
    
    const searchTool = new ItchioSearchTool();

    // Create strategy with scout instructions for genre selection
    const strategy = {
      platform: 'itchio' as const,
      instructions: scout.instructions,  // Pass instructions for genre selection
      expanded_keywords: scout.keywords,  // Pass keywords for genre analysis
      search_params: {
        keywords: scout.keywords || [],
        pages: ['games', 'new-and-popular'],  // Fallback pages if no genre selected
        maxResults: scout.max_results || 10
      }
    };

    logger.info('Strategy created with genre selection support', {
      runId: run_id,
      hasInstructions: !!scout.instructions,
      keywordCount: scout.keywords?.length || 0,
      instructionsPreview: scout.instructions?.substring(0, 100)
    });

    try {
      // Use the search tool's scrapeGameListings method (will auto-select genres)
      const listings = await searchTool.scrapeGameListings(strategy, mastra);
      
      logger.info('Successfully scraped game listings', {
        count: listings.length,
        runId: run_id,
        firstFewTitles: listings.slice(0, 3).map(g => g.title)
      });
      
      return { listings, scout, run_id };
    } catch (error) {
      logger.error('Failed to scrape game listings', {
        error: error instanceof Error ? error.message : String(error),
        runId: run_id
      });
      return { listings: [], scout, run_id };
    }
  }
});

// Step 2: Scrape detailed information for each game
const scrapeDetailedGamesStep = createStep({
  id: 'scrape-detailed-games',
  description: 'Get detailed information for each game',
  inputSchema: z.object({
    listings: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    detailedGames: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const { listings, scout, run_id } = inputData;
    const logger = mastra.getLogger();
    
    logger.info('=== STEP 2: Starting detailed game scraping ===', {
      runId: run_id,
      listingsCount: listings.length
    });
    
    if (listings.length === 0) {
      logger.warn('No listings to get details for', { runId: run_id });
      return { detailedGames: [], scout, run_id };
    }
    
    const searchTool = new ItchioSearchTool();
    
    // Extract URLs from listings
    const gameUrls = listings.map(listing => listing.url).filter(url => url);
    
    logger.info('Game URLs to scrape details for', {
      urls: gameUrls,
      count: gameUrls.length,
      runId: run_id
    });
    
    try {
      // Use the search tool's scrapeDetailedGames method
      const detailedGames = await searchTool.scrapeDetailedGames(gameUrls, mastra);
      
      logger.info('Successfully scraped detailed game info', {
        count: detailedGames.length,
        runId: run_id,
        gamesWithComments: detailedGames.filter(g => g.hasComments).length
      });
      
      return { detailedGames, scout, run_id };
    } catch (error) {
      logger.error('Failed to scrape detailed games', {
        error: error instanceof Error ? error.message : String(error),
        runId: run_id
      });
      return { detailedGames: [], scout, run_id };
    }
  }
});

// Step 3: Store games directly in database
const storeGamesDirectlyStep = createStep({
  id: 'store-games-directly',
  description: 'Store detailed games directly in database',
  inputSchema: z.object({
    detailedGames: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: resultsSchema,
  execute: async ({ inputData, mastra }) => {
    const { detailedGames, scout, run_id } = inputData;
    const logger = mastra.getLogger();
    const startTime = Date.now();
    
    logger.info('=== STEP 3: Starting direct database storage ===', {
      gamesCount: detailedGames.length,
      scoutId: scout.id,
      organizationId: scout.organization_id,
      runId: run_id
    });
    
    let totalStored = 0;
    let highRelevanceCount = 0;
    const errors: string[] = [];
    
    // First, verify database connection and table
    try {
      const tableCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'scout_results'
        )
      `);
      
      logger.info('Database table check', {
        tableExists: tableCheck.rows[0]?.exists,
        runId: run_id
      });
      
      if (!tableCheck.rows[0]?.exists) {
        logger.error('scout_results table does not exist!', { runId: run_id });
        return {
          success: false,
          run_id,
          results_count: 0,
          high_relevance_count: 0,
          execution_time_ms: Date.now() - startTime
        };
      }
    } catch (dbError) {
      logger.error('Failed to check database table', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
        runId: run_id
      });
    }
    
    // Store each game
    for (let i = 0; i < detailedGames.length; i++) {
      const game = detailedGames[i];
      
      try {
        // Generate a unique external ID
        const externalId = `itchio_${game.url?.split('/').pop() || Date.now()}_${i}`;
        
        // Calculate scores
        const engagementScore = Math.min(
          (game.commentCount || 0) * 10 + 
          (game.screenshots?.length || 0) * 5 + 
          (game.tags?.length || 0) * 2,
          100
        );
        const relevanceScore = 0.75; // Hardcoded high relevance for testing
        
        if (relevanceScore >= 0.7) highRelevanceCount++;
        
        logger.info(`Storing game ${i + 1}/${detailedGames.length}`, {
          title: game.title,
          url: game.url,
          externalId,
          engagementScore,
          relevanceScore,
          runId: run_id
        });
        
        // Simple INSERT without checking for duplicates
        const sql = `
          INSERT INTO scout_results (
            "scoutId", "organizationId", platform, "externalId",
            url, title, description, content, author,
            "engagementScore", "relevanceScore", "platformData", 
            status, "foundAt", "aiSummary", "aiConfidenceScore", "processedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
          )
          RETURNING id
        `;
        
        const values = [
          scout.id,                                          // $1: scoutId
          scout.organization_id,                             // $2: organizationId
          'itchio',                                          // $3: platform
          externalId,                                        // $4: externalId
          game.url || '',                                    // $5: url
          game.title || 'Unknown Game',                      // $6: title
          (game.description || '').substring(0, 500),        // $7: description
          game.fullDescription || game.description || '',    // $8: content
          game.developer || 'Unknown Developer',             // $9: author
          engagementScore,                                   // $10: engagementScore
          relevanceScore,                                    // $11: relevanceScore
          JSON.stringify({                                   // $12: platformData
            price: game.price,
            genre: game.genre,
            tags: game.tags || [],
            platforms: game.platforms || [],
            screenshots: game.screenshots || [],
            downloadCount: game.downloadCount,
            rating: game.rating,
            releaseDate: game.releaseDate,
            fileSize: game.fileSize,
            commentCount: game.commentCount || 0,
            hasComments: game.hasComments || false,
            comments: (game.comments || []).slice(0, 5)
          }),
          'new',                                             // $13: status
          new Date().toISOString(),                         // $14: foundAt
          `Indie game on itch.io: ${game.genre || 'Various'}`, // $15: aiSummary
          relevanceScore                                     // $16: aiConfidenceScore
        ];
        
        logger.info('Inserting game', {
          gameTitle: game.title,
          sqlPreview: sql.substring(0, 100) + '...',
          valuesCount: values.length,
          runId: run_id
        });
        
        const result = await query(sql, values);
        
        if (result.rowCount > 0) {
          totalStored++;
          logger.info(`✅ Successfully stored game ${i + 1}/${detailedGames.length}`, {
            title: game.title,
            recordId: result.rows[0]?.id,
            totalStoredSoFar: totalStored,
            runId: run_id
          });
        } else {
          logger.warn(`Failed to store game (no rows affected)`, {
            title: game.title,
            runId: run_id
          });
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${game.title}: ${errorMsg}`);
        
        logger.error(`❌ Failed to store game ${i + 1}/${detailedGames.length}`, {
          title: game.title,
          error: errorMsg,
          runId: run_id
        });
      }
    }
    
    // Update the scout run with final stats and set isRunning to false
    try {
      await execute(
        `UPDATE scout_runs
         SET status = 'completed',
             "resultsFound" = $2,
             "resultsProcessed" = $3,
             "completedAt" = NOW(),
             "isRunning" = false
         WHERE id = $1`,
        [run_id, detailedGames.length, totalStored]
      );
      
      logger.info('Updated scout run status to completed', {
        runId: run_id,
        resultsFound: detailedGames.length,
        resultsStored: totalStored
      });
    } catch (updateError) {
      logger.error('Failed to update scout run status', {
        error: updateError instanceof Error ? updateError.message : String(updateError),
        runId: run_id
      });
    }
    
    const executionTime = Date.now() - startTime;
    
    logger.info('=== STORAGE COMPLETE ===', {
      totalGames: detailedGames.length,
      totalStored,
      failedCount: errors.length,
      highRelevanceCount,
      executionTimeMs: executionTime,
      errors: errors.length > 0 ? errors : undefined,
      runId: run_id
    });
    
    return {
      success: totalStored > 0,
      run_id,
      results_count: totalStored,
      high_relevance_count: highRelevanceCount,
      execution_time_ms: executionTime
    };
  }
});


// Main Simplified Itch.io Scout Workflow
export const itchioScoutWorkflow = createWorkflow({
  id: 'itchio-scout-workflow',
  description: 'Simplified two-step itch.io scout workflow with direct storage',
  inputSchema: scoutInputSchema,
  outputSchema: resultsSchema
})
  // Update run status to searching
  .map(({ inputData }) => ({
    run_id: inputData.run_id,
    status: 'searching' as const,
    step_name: 'scrape_game_listings',
    step_data: { platform: 'itchio' }
  }))
  .then(updateRunStatusStep)
  
  // Step 1: Scrape game listings
  .map(({ getInitData }) => getInitData())
  .then(scrapeGameListingsStep)
  
  // Step 2: Get detailed information
  .then(scrapeDetailedGamesStep)
  
  // Step 3: Store directly in database
  .then(storeGamesDirectlyStep)
  
  .commit();