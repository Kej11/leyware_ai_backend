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
  execute: async ({ context }) => {
    const { scout_id } = context;
    
    try {
      const scout = await queryOne<Scout>(
        `SELECT * FROM scouts WHERE id = $1`,
        [scout_id]
      );
      
      if (!scout) {
        throw new Error(`Scout not found: ${scout_id}`);
      }
      
      console.log(`✅ Found scout: ${scout.name}`);
      
      return {
        scout: {
          id: scout.id,
          name: scout.name,
          instructions: scout.instructions,
          keywords: scout.keywords,
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
      console.error('❌ Failed to lookup scout:', error);
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
  execute: async ({ context }) => {
    const { scout_id, organization_id, max_results, quality_threshold } = context;
    
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
      
      console.log(`✅ Created scout run: ${result.id}`);
      
      return {
        run_id: result.id,
        success: true
      };
    } catch (error) {
      console.error('❌ Failed to create scout run:', error);
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
  execute: async ({ context }) => {
    const { run_id, status, step_name, step_data } = context;
    
    try {
      await execute(
        `UPDATE scout_runs 
         SET status = $1 
         WHERE id = $2`,
        [status, run_id]
      );
      
      console.log(`📊 Updated run status: ${step_name} -> ${status}`);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to update run status:', error);
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
  execute: async ({ context }) => {
    const { scout_id, run_id, organization_id, results } = context;
    
    if (!results || results.length === 0) {
      console.log('📝 No results to store');
      return { total_stored: 0, batch_count: 0, success: true };
    }
    
    const BATCH_SIZE = 50;
    const batches = [];
    
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      batches.push(results.slice(i, i + BATCH_SIZE));
    }
    
    let totalStored = 0;
    
    try {
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
            await execute(
              `INSERT INTO scout_results (
                "scoutId", "organizationId", platform, "externalId",
                url, title, description, content, author, "authorUrl",
                "engagementScore", "relevanceScore", "platformData", status, "foundAt",
                "aiSummary", "aiConfidenceScore", "processedAt"
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
              [
                scout_id,
                organization_id,
                'reddit',
                result.metadata.post_id || `reddit_${Date.now()}_${Math.random()}`,
                result.source_url,
                result.title,
                result.content.substring(0, 200),
                result.content,
                result.author,
                result.author_url,
                result.engagement_score,
                result.relevance_score,
                JSON.stringify(result.metadata),
                'active',
                result.created_at,
                result.analysis_reasoning || 'AI analysis completed',
                result.relevance_score
              ]
            );
            totalStored++;
          } catch (error) {
            console.error('Failed to insert result:', error);
          }
        }
        
        console.log(`📦 Stored batch ${index + 1}/${batches.length} (${batch.length} items)`);
      }
      
      console.log(`🎉 Successfully stored ${totalStored} results in ${batches.length} batches`);
      
      return {
        total_stored: totalStored,
        batch_count: batches.length,
        success: true
      };
    } catch (error) {
      console.error('❌ Failed to store results:', error);
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
  execute: async ({ context }) => {
    const { run_id, scout_id, results_found, results_processed, high_relevance_count, success, error_message } = context;
    
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
      
      console.log(`✅ Finalized scout run: ${run_id} (${status})`);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to finalize scout run:', error);
      return { success: false };
    }
  }
});