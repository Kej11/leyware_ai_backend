#!/usr/bin/env node

/**
 * Cloud Run Job Runner
 * 
 * Executes scout search workflow as a Cloud Run Job
 * Reads configuration from environment variables instead of HTTP requests
 */

// Import from the built Mastra output
import { mastra } from '../.mastra/output/index.mjs';

interface JobConfig {
  scoutId: string;
  runId?: string;
}

async function runJob() {
  console.log('🚀 Starting Scout Search Job...');
  
  // Read configuration from environment variables
  const scoutId = process.env.SCOUT_ID;
  const runId = process.env.RUN_ID;
  
  if (!scoutId) {
    console.error('❌ ERROR: SCOUT_ID environment variable is required');
    process.exit(1);
  }
  
  console.log(`📋 Job Configuration:
    Scout ID: ${scoutId}
    Run ID: ${runId || 'auto-generated'}
    Database: ${process.env.NEON_DATABASE_URL ? '✓ Connected' : '✗ Not configured'}
    AI Model: ${process.env.GOOGLE_GENERATIVE_AI_API_KEY ? '✓ Connected' : '✗ Not configured'}`);
  
  try {
    console.log('⚡ Executing scout search workflow...');
    
    const result = await mastra.workflows.scoutSearchWorkflow.execute({
      scout_id: scoutId,
      run_id: runId
    });
    
    console.log('✅ Workflow completed successfully!');
    console.log('📊 Result:', {
      runId: result.run_id,
      status: result.status,
      resultsCount: result.results?.length || 0,
      completedAt: new Date().toISOString()
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Workflow failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }
}

// Handle process signals for graceful shutdown
process.on('SIGTERM', () => {
  console.log('📥 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📥 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the job
runJob().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});