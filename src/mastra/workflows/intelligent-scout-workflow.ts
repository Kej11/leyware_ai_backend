import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  lookupScoutTool,
  createScoutRunTool,
  updateRunStatusTool,
  finalizeScoutRunTool,
  storeGameWithCommentsTool,
  batchStoreDecisionsTool,
  updateRunProgressTool
} from '../tools/database-tools';
import { ItchioSearchTool } from '../tools/platform-search/itchio-search-tool';
import { SteamSearchTool } from '../tools/platform-search/steam-search-tool';
import { generateSearchStrategy } from '../agents/search-planning-agent';
import { decideInvestigation } from '../agents/investigation-decision-agent';
import { decideStorage } from '../agents/storage-decision-agent';

const lookupScoutStep = createStep(lookupScoutTool);
const createScoutRunStep = createStep(createScoutRunTool);
const updateRunStatusStep = createStep(updateRunStatusTool);
const finalizeScoutRunStep = createStep(finalizeScoutRunTool);
const storeGameWithCommentsStep = createStep(storeGameWithCommentsTool);
const batchStoreDecisionsStep = createStep(batchStoreDecisionsTool);
const updateRunProgressStep = createStep(updateRunProgressTool);

const generateStrategyStep = createStep({
  id: 'generate-strategy',
  description: 'Generate platform-specific search strategy using AI',
  inputSchema: z.object({
    scout: z.object({
      id: z.string(),
      name: z.string(),
      instructions: z.string(),
      keywords: z.array(z.string()),
      platform: z.string(),
      platform_config: z.any(),
      max_results: z.number(),
      quality_threshold: z.number(),
      frequency: z.string()
    }),
    run_id: z.string()
  }),
  outputSchema: z.object({
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData }) => {
    const { scout, run_id } = inputData;
    
    console.log(`🎯 Generating search strategy for ${scout.platform}...`);
    
    const strategy = await generateSearchStrategy(
      scout.instructions,
      scout.keywords,
      scout.platform,
      scout.frequency
    );
    
    return {
      strategy,
      scout,
      run_id
    };
  }
});

const scrapeListingsStep = createStep({
  id: 'scrape-listings',
  description: 'Step 1: Scrape game listings for initial evaluation',
  inputSchema: z.object({
    strategy: z.any(),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    listings: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData }) => {
    const { strategy, scout, run_id } = inputData;
    
    console.log(`📋 Step 1: Scraping game listings from ${strategy.platform}...`);
    
    await updateRunProgressStep.execute({
      context: {
        run_id,
        status: 'searching'
      },
      runtimeContext: {} as any
    });

    // Select appropriate search tool based on platform
    let searchTool;
    if (strategy.platform === 'steam') {
      searchTool = new SteamSearchTool();
    } else {
      searchTool = new ItchioSearchTool();
    }
    
    const listings = await searchTool.scrapeGameListings(strategy);
    
    console.log(`📦 Found ${listings.length} game listings`);
    
    // Update run progress
    await updateRunProgressStep.execute({
      context: {
        run_id,
        results_found: listings.length
      },
      runtimeContext: {} as any
    });
    
    return {
      listings,
      scout,
      run_id
    };
  }
});

const investigationDecisionStep = createStep({
  id: 'investigation-decision',
  description: 'Step 2: LLM decides which games to investigate further',
  inputSchema: z.object({
    listings: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    investigation_decisions: z.array(z.any()),
    games_to_investigate: z.array(z.string()),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData }) => {
    const { listings, scout, run_id } = inputData;
    
    console.log(`🧠 Step 2: Making investigation decisions for ${listings.length} games...`);
    
    await updateRunProgressStep.execute({
      context: {
        run_id,
        status: 'analyzing'
      },
      runtimeContext: {} as any
    });

    // Calculate max investigations (30-50% of found games, max 10)
    const maxInvestigations = Math.min(Math.ceil(listings.length * 0.4), 10);
    
    const investigationDecisions = await decideInvestigation(
      scout.instructions,
      scout.keywords,
      listings,
      maxInvestigations
    );
    
    // Store investigation decisions
    const decisionRecords = investigationDecisions.map(decision => ({
      stage: 'listing' as const,
      item_identifier: decision.gameUrl || decision.gameTitle,
      decision: decision.shouldInvestigate ? 'investigate' as const : 'skip' as const,
      reasoning: decision.reasoning,
      score: decision.score,
      item_data: listings.find(g => g.url === decision.gameUrl || g.title === decision.gameTitle)
    }));
    
    await batchStoreDecisionsStep.execute({
      context: {
        run_id,
        decisions: decisionRecords
      },
      runtimeContext: {} as any
    });
    
    const gamesToInvestigate = investigationDecisions
      .filter(d => d.shouldInvestigate)
      .map(d => d.gameUrl)
      .filter(url => url && url.length > 0);
    
    console.log(`📊 Investigation decisions: ${gamesToInvestigate.length}/${listings.length} games selected for detailed investigation`);
    
    await updateRunProgressStep.execute({
      context: {
        run_id,
        results_processed: gamesToInvestigate.length,
        progress_data: {
          investigation_completed_at: new Date().toISOString(),
          games_investigated: gamesToInvestigate.length
        }
      },
      runtimeContext: {} as any
    });
    
    return {
      investigation_decisions: investigationDecisions,
      games_to_investigate: gamesToInvestigate,
      scout,
      run_id
    };
  }
});

const scrapeDetailedGamesStep = createStep({
  id: 'scrape-detailed-games',
  description: 'Step 3: Scrape detailed game data with comments for selected games',
  inputSchema: z.object({
    games_to_investigate: z.array(z.string()),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    detailed_games: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData }) => {
    const { games_to_investigate, scout, run_id } = inputData;
    
    if (games_to_investigate.length === 0) {
      console.log(`⚠️ No games selected for detailed investigation`);
      return {
        detailed_games: [],
        scout,
        run_id
      };
    }
    
    console.log(`🔍 Step 3: Scraping detailed data for ${games_to_investigate.length} selected games...`);
    
    // Select appropriate search tool based on platform
    let searchTool;
    if (scout.platform === 'steam') {
      searchTool = new SteamSearchTool();
    } else {
      searchTool = new ItchioSearchTool();
    }
    
    const detailedGames = await searchTool.scrapeDetailedGames(games_to_investigate);
    
    const totalComments = detailedGames.reduce((sum, game) => sum + (game.commentCount || 0), 0);
    
    console.log(`📦 Successfully scraped ${detailedGames.length} games with ${totalComments} total comments`);
    
    await updateRunProgressStep.execute({
      context: {
        run_id,
        progress_data: {
          total_comments_collected: totalComments,
          detailed_scraping_completed_at: new Date().toISOString()
        }
      },
      runtimeContext: {} as any
    });
    
    return {
      detailed_games: detailedGames,
      scout,
      run_id
    };
  }
});

const storageDecisionStep = createStep({
  id: 'storage-decision',
  description: 'Step 4: LLM makes final decision on what to store',
  inputSchema: z.object({
    detailed_games: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    storage_decisions: z.array(z.any()),
    games_to_store: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData }) => {
    const { detailed_games, scout, run_id } = inputData;
    
    if (detailed_games.length === 0) {
      console.log(`⚠️ No detailed games to evaluate for storage`);
      return {
        storage_decisions: [],
        games_to_store: [],
        scout,
        run_id
      };
    }
    
    console.log(`🧠 Step 4: Making storage decisions for ${detailed_games.length} detailed games...`);
    
    await updateRunProgressStep.execute({
      context: {
        run_id,
        status: 'storing'
      },
      runtimeContext: {} as any
    });

    const storageDecisions = await decideStorage(
      scout.instructions,
      scout.keywords,
      detailed_games,
      scout.quality_threshold
    );
    
    // Store storage decisions
    const decisionRecords = storageDecisions.map(decision => ({
      stage: 'storage' as const,
      item_identifier: decision.gameUrl || decision.gameTitle,
      decision: decision.shouldStore ? 'store' as const : 'discard' as const,
      reasoning: decision.reasoning,
      score: decision.score,
      item_data: detailed_games.find(g => g.url === decision.gameUrl || g.title === decision.gameTitle)
    }));
    
    await batchStoreDecisionsStep.execute({
      context: {
        run_id,
        decisions: decisionRecords
      },
      runtimeContext: {} as any
    });
    
    const gamesToStore = detailed_games.filter(game => {
      const decision = storageDecisions.find(d => d.gameUrl === game.url || d.gameTitle === game.title);
      return decision?.shouldStore;
    });
    
    console.log(`📊 Storage decisions: ${gamesToStore.length}/${detailed_games.length} games approved for storage`);
    
    await updateRunProgressStep.execute({
      context: {
        run_id,
        progress_data: {
          storage_decision_completed_at: new Date().toISOString(),
          games_approved_for_storage: gamesToStore.length
        }
      },
      runtimeContext: {} as any
    });
    
    return {
      storage_decisions: storageDecisions,
      games_to_store: gamesToStore,
      scout,
      run_id
    };
  }
});

const storeApprovedGamesStep = createStep({
  id: 'store-approved-games',
  description: 'Step 5: Store approved games with comments in database',
  inputSchema: z.object({
    games_to_store: z.array(z.any()),
    storage_decisions: z.array(z.any()),
    scout: z.any(),
    run_id: z.string()
  }),
  outputSchema: z.object({
    stored_count: z.number(),
    scout: z.any(),
    run_id: z.string()
  }),
  execute: async ({ inputData }) => {
    const { games_to_store, storage_decisions, scout, run_id } = inputData;
    
    if (games_to_store.length === 0) {
      console.log(`⚠️ No games approved for storage`);
      return {
        stored_count: 0,
        scout,
        run_id
      };
    }
    
    console.log(`💾 Step 5: Storing ${games_to_store.length} approved games with comments...`);
    
    let storedCount = 0;
    
    for (const game of games_to_store) {
      try {
        const decision = storage_decisions.find(d => 
          d.gameUrl === game.url || d.gameTitle === game.title
        );
        
        if (!decision) {
          console.warn(`⚠️ No decision found for game: ${game.title}`);
          continue;
        }
        
        const result = await storeGameWithCommentsStep.execute({
          context: {
            scout_id: scout.id,
            organization_id: scout.organization_id,
            game,
            decision: {
              reasoning: decision.reasoning,
              score: decision.score,
              sentiment: decision.sentiment
            }
          },
          runtimeContext: {} as any
        });
        
        if (result.success) {
          storedCount++;
          console.log(`✅ Stored: ${game.title} (${result.comments_stored} comments)`);
        } else {
          console.error(`❌ Failed to store: ${game.title}`);
        }
        
      } catch (error) {
        console.error(`❌ Error storing game ${game.title}:`, error);
      }
    }
    
    console.log(`🎉 Storage completed: ${storedCount}/${games_to_store.length} games successfully stored`);
    
    return {
      stored_count: storedCount,
      scout,
      run_id
    };
  }
});

export const intelligentScoutWorkflow = createWorkflow({
  name: 'intelligent-scout-workflow',
  description: 'Intelligent scout workflow with LLM decision making at each stage (supports itch.io and Steam)',
  
  steps: [
    // 1. Get scout configuration
    lookupScoutStep,
    createScoutRunStep,
    
    // 2. Generate search strategy
    generateStrategyStep,
    
    // 3. STEP 1: Scrape game listings (fast, broad)
    scrapeListingsStep,
    
    // 4. STEP 2: LLM decides which games to investigate
    investigationDecisionStep,
    
    // 5. STEP 3: Detailed scraping with comments (slow, targeted)  
    scrapeDetailedGamesStep,
    
    // 6. STEP 4: LLM final storage decision
    storageDecisionStep,
    
    // 7. STEP 5: Store approved games with comments
    storeApprovedGamesStep,
    
    // 8. Finalize run with comprehensive metrics
    finalizeScoutRunStep
  ]
});