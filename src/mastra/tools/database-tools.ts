import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { query, queryOne, execute } from '../database/neon-client';
import { Scout, ScoutRun, ScoutResult } from '../database/schemas';

export const lookupScoutTool = createTool({
  id: 'lookup-scout',
  description: 'Lookup scout configuration from database',
  inputSchema: z.object({
    scout_id: z.string().uuid()
  }),
  outputSchema: z.object({
    scout: z.object({
      id: z.string(),
      name: z.string(),
      instructions: z.string(),
      keywords: z.array(z.string()),
      platform: z.string(),
      platform_config: z.any(),
      organization_id: z.string(),
      max_results: z.number(),
      quality_threshold: z.number(),
      frequency: z.string(),
      total_runs: z.number()
    }),
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { scout_id } = context;
    const logger = mastra.getLogger();
    
    try {
      const scout = await queryOne<Scout>(
        `SELECT * FROM scouts WHERE id = $1`,
        [scout_id]
      );
      
      if (!scout) {
        throw new Error(`Scout not found: ${scout_id}`);
      }
      
      logger.info('Successfully found scout', { 
        scoutId: scout_id, 
        scoutName: scout.name,
        platform: scout.platform,
        keywords: scout.keywords?.length || 0
      });
      
      return {
        scout: {
          id: scout.id,
          name: scout.name,
          instructions: scout.instructions,
          keywords: scout.keywords || [],
          platform: scout.platform,
          platform_config: scout.settings || {},
          organization_id: scout.organizationId,
          max_results: scout.maxResults,
          quality_threshold: parseFloat(scout.qualityThreshold),
          frequency: scout.frequency,
          total_runs: scout.totalRuns || 0
        },
        success: true
      };
    } catch (error) {
      logger.error('Failed to lookup scout', { 
        scoutId: scout_id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
});

export const createScoutRunTool = createTool({
  id: 'create-scout-run',
  description: 'Create a new scout run record',
  inputSchema: z.object({
    scout_id: z.string().uuid(),
    organization_id: z.string(),
    max_results: z.number(),
    quality_threshold: z.number()
  }),
  outputSchema: z.object({
    run_id: z.string(),
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { scout_id, organization_id, max_results, quality_threshold } = context;
    const logger = mastra.getLogger();
    
    try {
      const result = await queryOne<{ id: string }>(
        `INSERT INTO scout_runs (
          "scoutId", "organizationId", status, "runConfig", "startedAt"
        ) VALUES ($1, $2, $3, $4, NOW()) 
        RETURNING id`,
        [
          scout_id,
          organization_id,
          'initializing',
          JSON.stringify({ max_results, quality_threshold })
        ]
      );
      
      if (!result) {
        throw new Error('Failed to create scout run');
      }
      
      logger.info('Successfully created scout run', { 
        runId: result.id, 
        scoutId: scout_id,
        organizationId: organization_id,
        maxResults: max_results,
        qualityThreshold: quality_threshold
      });
      
      return {
        run_id: result.id,
        success: true
      };
    } catch (error) {
      logger.error('Failed to create scout run', { 
        scoutId: scout_id,
        organizationId: organization_id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
});

export const updateRunStatusTool = createTool({
  id: 'update-run-status',
  description: 'Update scout run status in database',
  inputSchema: z.object({
    run_id: z.string(),
    status: z.string(),
    step_name: z.string(),
    step_data: z.any().optional()
  }),
  outputSchema: z.object({
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { run_id, status, step_name, step_data } = context;
    const logger = mastra.getLogger();
    
    try {
      await execute(
        `UPDATE scout_runs 
         SET status = $1 
         WHERE id = $2`,
        [status, run_id]
      );
      
      logger.info('Updated run status', { 
        runId: run_id, 
        stepName: step_name,
        status: status,
        stepData: step_data
      });
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to update run status', { 
        runId: run_id,
        stepName: step_name,
        status: status,
        error: error instanceof Error ? error.message : String(error)
      });
      return { success: false };
    }
  }
});

export const batchStoreResultsTool = createTool({
  id: 'batch-store-results',
  description: 'Store scout results in batches',
  inputSchema: z.object({
    scout_id: z.string(),
    run_id: z.string(),
    organization_id: z.string(),
    results: z.array(z.object({
      source_url: z.string(),
      title: z.string(),
      content: z.string(),
      author: z.string(),
      author_url: z.string().optional(),
      engagement_score: z.number(),
      relevance_score: z.number(),
      metadata: z.any(),
      created_at: z.string()
    }))
  }),
  outputSchema: z.object({
    total_stored: z.number(),
    batch_count: z.number(),
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { scout_id, run_id, organization_id, results } = context;
    const logger = mastra.getLogger();
    
    if (!results || results.length === 0) {
      logger.info('No results to store', { runId: run_id, scoutId: scout_id });
      return { total_stored: 0, batch_count: 0, success: true };
    }
    
    const BATCH_SIZE = 50;
    const batches = [];
    
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      batches.push(results.slice(i, i + BATCH_SIZE));
    }
    
    let totalStored = 0;
    
    try {
      // Test database connection and table existence
      try {
        const tableCheck = await query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'scout_results' 
          AND table_schema = 'public'
          ORDER BY ordinal_position
        `);
        logger.info('Scout results table schema', { 
          tableExists: tableCheck.rows.length > 0,
          columns: tableCheck.rows.map(row => `${row.column_name}(${row.data_type})`),
          runId: run_id 
        });
      } catch (schemaError) {
        logger.error('Failed to check table schema', { 
          error: schemaError instanceof Error ? schemaError.message : String(schemaError),
          runId: run_id 
        });
      }

      for (const [index, batch] of batches.entries()) {
        // Update status to indicate we're storing results
        await execute(
          `UPDATE scout_runs 
           SET status = 'storing'
           WHERE id = $1`,
          [run_id]
        );
        
        for (const result of batch) {
          try {
            // Generate platform-specific external ID
            let externalId = '';
            let platform = result.platform || 'itchio'; // Default to itchio for this workflow
            
            if (platform === 'reddit') {
              externalId = result.metadata.post_id || `reddit_${Date.now()}_${Math.random()}`;
            } else if (platform === 'itchio') {
              // Use URL or create unique ID for itch.io
              externalId = result.metadata.game_id || `itchio_${Date.now()}_${Math.random()}`;
            } else if (platform === 'steam') {
              // Use Steam app ID or create unique ID
              externalId = result.metadata.appId || `steam_${Date.now()}_${Math.random()}`;
            } else {
              externalId = `${platform}_${Date.now()}_${Math.random()}`;
            }
            
            logger.info('Processing result for storage', {
              resultTitle: result.title,
              resultPlatform: result.platform,
              detectedPlatform: platform,
              externalId: externalId,
              sourceUrl: result.source_url,
              author: result.author,
              engagementScore: result.engagement_score,
              relevanceScore: result.relevance_score,
              runId: run_id
            });

            const insertResult = await execute(
              `INSERT INTO scout_results (
                "scoutId", "organizationId", platform, "externalId",
                url, title, description, content, author, "authorUrl",
                "engagementScore", "relevanceScore", "platformData", status, "foundAt",
                "aiSummary", "aiConfidenceScore", "processedAt"
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
              [
                scout_id,
                organization_id,
                platform,
                externalId,
                result.source_url,
                result.title,
                result.content.substring(0, 200),
                result.content,
                result.author,
                result.author_url,
                result.engagement_score,
                result.relevance_score,
                JSON.stringify(result.metadata),
                'new',
                result.created_at,
                result.analysis_reasoning || 'AI analysis completed',
                result.relevance_score
              ]
            );
            
            logger.info('Successfully inserted result into database', {
              resultTitle: result.title,
              platform: platform,
              externalId: externalId,
              insertResult: insertResult,
              runId: run_id
            });
            totalStored++;
          } catch (error) {
            logger.error('Failed to insert result', { 
              runId: run_id,
              platform: platform,
              title: result.title,
              author: result.author,
              sourceUrl: result.source_url,
              scoutId: scout_id,
              organizationId: organization_id,
              error: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined
            });
          }
        }
        
        logger.info('Stored batch', { 
          runId: run_id,
          batchIndex: index + 1,
          totalBatches: batches.length,
          batchSize: batch.length
        });
      }
      
      logger.info('Successfully completed batch storage', { 
        runId: run_id,
        totalStored: totalStored,
        batchCount: batches.length,
        scoutId: scout_id
      });
      
      return {
        total_stored: totalStored,
        batch_count: batches.length,
        success: true
      };
    } catch (error) {
      logger.error('Failed to store results', { 
        runId: run_id,
        scoutId: scout_id,
        resultsCount: results?.length || 0,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        total_stored: totalStored,
        batch_count: 0,
        success: false
      };
    }
  }
});

export const finalizeScoutRunTool = createTool({
  id: 'finalize-scout-run',
  description: 'Finalize scout run with statistics',
  inputSchema: z.object({
    run_id: z.string(),
    scout_id: z.string(),
    results_found: z.number(),
    results_processed: z.number(),
    high_relevance_count: z.number(),
    success: z.boolean(),
    error_message: z.string().optional()
  }),
  outputSchema: z.object({
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { run_id, scout_id, results_found, results_processed, high_relevance_count, success, error_message } = context;
    const logger = mastra.getLogger();
    
    try {
      const status = success ? 'completed' : 'failed';
      
      await execute(
        `UPDATE scout_runs 
         SET status = $1, "resultsFound" = $2, "resultsProcessed" = $3, 
             "completedAt" = NOW(), "errorMessage" = $4
         WHERE id = $5`,
        [status, results_found, results_processed, error_message, run_id]
      );
      
      // Note: Simplified finalization - no event tracking table in current schema
      
      logger.info('Finalized scout run', { 
        runId: run_id,
        scoutId: scout_id,
        status: status,
        resultsFound: results_found,
        resultsProcessed: results_processed,
        highRelevanceCount: high_relevance_count,
        errorMessage: error_message
      });
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to finalize scout run', { 
        runId: run_id,
        scoutId: scout_id,
        error: error instanceof Error ? error.message : String(error)
      });
      return { success: false };
    }
  }
});

// NEW: Enhanced tools for intelligent scout workflow

export const storeGameWithCommentsTool = createTool({
  id: 'store-game-with-comments',
  description: 'Store a game result with enhanced data including comments in platformData',
  inputSchema: z.object({
    scout_id: z.string().uuid(),
    organization_id: z.string(),
    game: z.object({
      title: z.string(),
      developer: z.string(),
      url: z.string(),
      price: z.string().optional(),
      genre: z.string().optional(),
      fullDescription: z.string().optional(),
      screenshots: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      platforms: z.array(z.string()).optional(),
      rating: z.string().optional(),
      fileSize: z.string().optional(),
      releaseDate: z.string().optional(),
      downloadCount: z.string().optional(),
      comments: z.array(z.object({
        author: z.string(),
        content: z.string(),
        date: z.string().optional(),
        isDevReply: z.boolean().optional()
      })).optional()
    }),
    decision: z.object({
      reasoning: z.string(),
      score: z.number(),
      sentiment: z.string().optional()
    })
  }),
  outputSchema: z.object({
    result_id: z.string(),
    comments_stored: z.number(),
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { scout_id, organization_id, game, decision } = context;
    const logger = mastra.getLogger();
    
    try {
      // First get the scout to determine the platform
      const scout = await queryOne<{ platform: string }>(
        `SELECT platform FROM scouts WHERE id = $1`,
        [scout_id]
      );
      
      if (!scout) {
        throw new Error(`Scout not found with id: ${scout_id}`);
      }
      
      const platform = scout.platform;
      
      logger.info('Storing game with comments', { 
        gameTitle: game.title,
        developer: game.developer,
        platform: platform,
        commentsCount: game.comments?.length || 0,
        decisionScore: decision.score,
        scoutId: scout_id
      });
      
      // Calculate engagement score from comments
      const engagementScore = game.comments ? 
        Math.min(game.comments.length * 0.1, 1.0) : 0;
      
      // Calculate sentiment score from decision
      const sentimentScore = decision.sentiment === 'positive' ? 0.8 :
                           decision.sentiment === 'negative' ? 0.2 : 0.5;
      
      // Generate platform-specific external ID
      const externalId = `${platform}_${game.url.split('/').pop() || Date.now()}_${Date.now()}`;
      
      // Store main game result using existing schema
      const resultId = await queryOne<{ id: string }>(
        `INSERT INTO scout_results (
          "scoutId", "organizationId", platform, "externalId",
          url, title, description, content, author,
          "engagementScore", "relevanceScore", "sentimentScore", "platformData",
          status, "foundAt", "aiSummary", "aiConfidenceScore", "processedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, $16, NOW()
        ) RETURNING id`,
        [
          scout_id,
          organization_id,
          platform,
          externalId,
          game.url,
          game.title,
          game.fullDescription?.substring(0, 500) || game.title,
          game.fullDescription || '',
          game.developer,
          engagementScore,
          decision.score,
          sentimentScore,
          JSON.stringify({
            price: game.price,
            genre: game.genre,
            screenshots: game.screenshots,
            tags: game.tags,
            platforms: game.platforms,
            rating: game.rating,
            fileSize: game.fileSize,
            releaseDate: game.releaseDate,
            downloadCount: game.downloadCount,
            comments: game.comments,
            commentsCount: game.comments?.length || 0,
            hasDevReplies: game.comments?.some(c => c.isDevReply) || false,
            decisionReasoning: decision.reasoning,
            sentiment: decision.sentiment
          }),
          'new',
          decision.reasoning,
          decision.score
        ]
      );

      if (!resultId) {
        throw new Error('Failed to get result ID after insertion');
      }

      const commentsStored = game.comments?.length || 0;
      logger.info('Successfully stored game with comments', { 
        gameTitle: game.title,
        resultId: resultId.id,
        commentsStored: commentsStored,
        platformDataSize: JSON.stringify(game).length,
        scoutId: scout_id
      });
      
      return {
        result_id: resultId.id,
        comments_stored: commentsStored,
        success: true
      };
      
    } catch (error) {
      logger.error('Failed to store game with comments', { 
        gameTitle: game.title,
        scoutId: scout_id,
        commentsCount: game.comments?.length || 0,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        result_id: '',
        comments_stored: 0,
        success: false
      };
    }
  }
});

export const storeScoutDecisionTool = createTool({
  id: 'store-scout-decision',
  description: 'Store a decision made by the intelligent scout workflow in runConfig',
  inputSchema: z.object({
    run_id: z.string().uuid(),
    stage: z.enum(['listing', 'investigation', 'storage']),
    item_identifier: z.string(),
    decision: z.enum(['investigate', 'skip', 'store', 'discard']),
    reasoning: z.string().optional(),
    score: z.number().optional(),
    item_data: z.any().optional()
  }),
  outputSchema: z.object({
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { run_id, stage, item_identifier, decision, reasoning, score, item_data } = context;
    const logger = mastra.getLogger();
    
    try {
      // Get current runConfig
      const currentRun = await queryOne<{ runConfig: any }>(
        `SELECT "runConfig" FROM scout_runs WHERE id = $1`,
        [run_id]
      );
      
      const existingConfig = currentRun?.runConfig || {};
      const decisions = existingConfig.decisions || [];
      
      // Add new decision
      decisions.push({
        stage,
        item_identifier,
        decision,
        reasoning: reasoning || null,
        score: score || null,
        item_data: item_data || null,
        timestamp: new Date().toISOString()
      });
      
      // Update runConfig with new decisions array
      const updatedConfig = {
        ...existingConfig,
        decisions
      };
      
      await execute(
        `UPDATE scout_runs SET "runConfig" = $1 WHERE id = $2`,
        [JSON.stringify(updatedConfig), run_id]
      );

      logger.info('Stored scout decision', { 
        runId: run_id,
        stage: stage,
        itemIdentifier: item_identifier,
        decision: decision,
        score: score
      });
      
      return { success: true };
      
    } catch (error) {
      logger.error('Failed to store scout decision', { 
        runId: run_id,
        stage: stage,
        itemIdentifier: item_identifier,
        decision: decision,
        error: error instanceof Error ? error.message : String(error)
      });
      return { success: false };
    }
  }
});

export const batchStoreDecisionsTool = createTool({
  id: 'batch-store-decisions',
  description: 'Store multiple scout decisions in batch in runConfig',
  inputSchema: z.object({
    run_id: z.string().uuid(),
    decisions: z.array(z.object({
      stage: z.enum(['listing', 'investigation', 'storage']),
      item_identifier: z.string(),
      decision: z.enum(['investigate', 'skip', 'store', 'discard']),
      reasoning: z.string().optional(),
      score: z.number().optional(),
      item_data: z.any().optional()
    }))
  }),
  outputSchema: z.object({
    decisions_stored: z.number(),
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { run_id, decisions } = context;
    const logger = mastra.getLogger();
    
    try {
      logger.info('Storing batch of scout decisions', { 
        runId: run_id,
        decisionsCount: decisions.length,
        stages: [...new Set(decisions.map(d => d.stage))],
        decisionTypes: [...new Set(decisions.map(d => d.decision))]
      });
      
      // Get current runConfig
      const currentRun = await queryOne<{ runConfig: any }>(
        `SELECT "runConfig" FROM scout_runs WHERE id = $1`,
        [run_id]
      );
      
      const existingConfig = currentRun?.runConfig || {};
      const existingDecisions = existingConfig.decisions || [];
      
      // Add all new decisions with timestamps
      const newDecisions = decisions.map(decision => ({
        stage: decision.stage,
        item_identifier: decision.item_identifier,
        decision: decision.decision,
        reasoning: decision.reasoning || null,
        score: decision.score || null,
        item_data: decision.item_data || null,
        timestamp: new Date().toISOString()
      }));
      
      // Update runConfig with combined decisions
      const updatedConfig = {
        ...existingConfig,
        decisions: [...existingDecisions, ...newDecisions]
      };
      
      await execute(
        `UPDATE scout_runs SET "runConfig" = $1 WHERE id = $2`,
        [JSON.stringify(updatedConfig), run_id]
      );
      
      logger.info('Successfully stored decisions in runConfig', { 
        runId: run_id,
        decisionsStored: decisions.length,
        totalDecisions: newDecisions.length + existingDecisions.length
      });
      
      return {
        decisions_stored: decisions.length,
        success: true
      };
      
    } catch (error) {
      logger.error('Failed to batch store decisions', { 
        runId: run_id,
        decisionsCount: decisions.length,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        decisions_stored: 0,
        success: false
      };
    }
  }
});

export const directStoreResultsTool = createTool({
  id: 'direct-store-results',
  description: 'Direct database storage with extensive logging for debugging',
  inputSchema: z.object({
    scout_id: z.string(),
    run_id: z.string(),
    organization_id: z.string(),
    results: z.array(z.object({
      source_url: z.string(),
      title: z.string(),
      content: z.string(),
      author: z.string(),
      engagement_score: z.number(),
      relevance_score: z.number(),
      platform: z.string()
    }))
  }),
  outputSchema: z.object({
    total_stored: z.number(),
    success: z.boolean(),
    details: z.array(z.object({
      title: z.string(),
      success: z.boolean(),
      error: z.string().optional()
    }))
  }),
  execute: async ({ context, mastra }) => {
    const { scout_id, run_id, organization_id, results } = context;
    const logger = mastra.getLogger();
    
    logger.info('=== DIRECT STORE RESULTS DEBUGGING ===', {
      scout_id,
      run_id,
      organization_id,
      resultsCount: results.length
    });
    
    if (!results || results.length === 0) {
      logger.warn('No results provided to store');
      return { total_stored: 0, success: true, details: [] };
    }
    
    // Test database connection first
    try {
      const testQuery = await query('SELECT NOW() as current_time');
      logger.info('Database connection test successful', { 
        currentTime: testQuery.rows[0]?.current_time 
      });
    } catch (error) {
      logger.error('Database connection test failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return { total_stored: 0, success: false, details: [] };
    }
    
    let totalStored = 0;
    const details = [];
    
    // Store each result individually with detailed logging
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      
      logger.info(`Storing result ${i + 1}/${results.length}`, {
        title: result.title,
        platform: result.platform,
        author: result.author,
        url: result.source_url
      });
      
      try {
        // Generate external ID
        const externalId = `${result.platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const insertResult = await execute(
          `INSERT INTO scout_results (
            scoutid, organizationid, platform, externalid,
            url, title, description, content, author,
            engagementscore, relevancescore, platformdata, status,
            foundat, aisummary, aiconfidencescore, processedat
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())`,
          [
            scout_id,
            organization_id,
            result.platform,
            externalId,
            result.source_url,
            result.title,
            result.content.substring(0, 200), // description (truncated)
            result.content, // full content
            result.author,
            result.engagement_score,
            result.relevance_score,
            JSON.stringify({ simplified: true, debug: true }), // simple metadata
            'new',
            new Date().toISOString(), // foundat
            'Direct storage test', // aisummary
            result.relevance_score // aiconfidencescore
          ]
        );
        
        logger.info(`Successfully stored result ${i + 1}`, {
          title: result.title,
          externalId: externalId,
          insertRowCount: insertResult.rowCount
        });
        
        totalStored++;
        details.push({
          title: result.title,
          success: true
        });
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to store result ${i + 1}`, {
          title: result.title,
          error: errorMsg,
          stack: error instanceof Error ? error.stack : undefined
        });
        
        details.push({
          title: result.title,
          success: false,
          error: errorMsg
        });
      }
    }
    
    logger.info('=== DIRECT STORE RESULTS COMPLETE ===', {
      totalStored,
      totalAttempted: results.length,
      successRate: `${((totalStored / results.length) * 100).toFixed(1)}%`
    });
    
    return {
      total_stored: totalStored,
      success: totalStored > 0,
      details
    };
  }
});

export const updateRunProgressTool = createTool({
  id: 'update-run-progress',
  description: 'Update scout run progress with intelligent workflow metrics',
  inputSchema: z.object({
    run_id: z.string().uuid(),
    status: z.enum(['initializing', 'searching', 'analyzing', 'storing', 'completed', 'failed']).optional(),
    results_found: z.number().optional(),
    results_processed: z.number().optional(),
    progress_data: z.any().optional()
  }),
  outputSchema: z.object({
    success: z.boolean()
  }),
  execute: async ({ context, mastra }) => {
    const { run_id, status, results_found, results_processed, progress_data } = context;
    const logger = mastra.getLogger();
    
    try {
      // Build dynamic query using existing scout_runs columns
      const updates = [];
      const values = [];
      let paramIndex = 1;
      
      if (status) {
        updates.push(`status = $${paramIndex++}`);
        values.push(status);
      }
      
      if (results_found !== undefined) {
        updates.push(`"resultsFound" = $${paramIndex++}`);
        values.push(results_found);
      }
      
      if (results_processed !== undefined) {
        updates.push(`"resultsProcessed" = $${paramIndex++}`);
        values.push(results_processed);
      }
      
      if (progress_data) {
        // Get current runConfig and merge with progress_data
        const currentRun = await queryOne<{ runConfig: any }>(
          `SELECT "runConfig" FROM scout_runs WHERE id = $${paramIndex}`,
          [run_id]
        );
        
        const existingConfig = currentRun?.runConfig || {};
        const updatedConfig = {
          ...existingConfig,
          progress: {
            ...existingConfig.progress,
            ...progress_data,
            lastUpdated: new Date().toISOString()
          }
        };
        
        updates.push(`"runConfig" = $${paramIndex++}`);
        values.push(JSON.stringify(updatedConfig));
      }
      
      values.push(run_id);
      
      if (updates.length > 0) {
        const query = `UPDATE scout_runs SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
        await execute(query, values);
      }
      
      logger.info('Updated run progress', { 
        runId: run_id,
        status: status,
        resultsFound: results_found,
        resultsProcessed: results_processed,
        progressUpdates: Object.keys(progress_data || {})
      });
      
      return { success: true };
      
    } catch (error) {
      logger.error('Failed to update run progress', { 
        runId: run_id,
        status: status,
        error: error instanceof Error ? error.message : String(error)
      });
      return { success: false };
    }
  }
});