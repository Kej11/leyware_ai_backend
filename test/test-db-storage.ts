#!/usr/bin/env node

import { execute, query } from '../src/mastra/database/neon-client';

async function testDatabaseStorage() {
  console.log('🧪 Testing Database Storage for Publisher Workflow\n');
  
  const ITCH_IO_SCOUT_ID = '99349cb8-e64f-44db-9385-00240821fc66';
  
  try {
    // 1. Check scout exists
    const scoutResult = await query(
      `SELECT id, name, "organizationId" FROM scouts WHERE id = $1`,
      [ITCH_IO_SCOUT_ID]
    );
    
    if (!scoutResult.rows || scoutResult.rows.length === 0) {
      console.error('❌ Scout not found');
      return;
    }
    
    const scout = scoutResult.rows[0];
    console.log('✅ Scout found:', scout.name);
    
    // 2. Create a test scout run
    const runResult = await query(
      `INSERT INTO scout_runs 
       ("scoutId", "organizationId", status, "startedAt", "runConfig")
       VALUES ($1, $2, 'testing', NOW(), $3)
       RETURNING id`,
      [scout.id, scout.organizationId, JSON.stringify({ test: true })]
    );
    
    const runId = runResult.rows[0].id;
    console.log('✅ Created scout run:', runId);
    
    // 3. Insert a test result
    const testResult = {
      title: 'Test Game',
      url: 'https://itch.io/test-game',
      developer: 'Test Developer',
      content: 'Test investment thesis',
      relevance: 0.9,
      engagement: 0.8
    };
    
    const insertResult = await execute(
      `INSERT INTO scout_results 
       ("scoutId", "organizationId", platform, "externalId", url, title, 
        description, content, author, "engagementScore", "relevanceScore", 
        status, "foundAt", "aiSummary", "aiConfidenceScore", "processedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14, NOW())`,
      [
        scout.id,
        scout.organizationId,
        'itch.io',
        `test_${Date.now()}`,
        testResult.url,
        testResult.title,
        testResult.content.substring(0, 100),
        testResult.content,
        testResult.developer,
        testResult.engagement,
        testResult.relevance,
        'new',
        'Test summary',
        testResult.relevance
      ]
    );
    
    console.log('✅ Inserted test result');
    
    // 4. Update scout run
    await execute(
      `UPDATE scout_runs 
       SET status = 'completed', 
           "resultsFound" = 1, 
           "resultsProcessed" = 1,
           "completedAt" = NOW()
       WHERE id = $1`,
      [runId]
    );
    
    console.log('✅ Updated scout run to completed');
    
    // 5. Verify the data
    const results = await query(
      `SELECT * FROM scout_results 
       WHERE "scoutId" = $1 
       ORDER BY "createdAt" DESC 
       LIMIT 1`,
      [scout.id]
    );
    
    if (results.rows && results.rows.length > 0) {
      console.log('✅ Verified data in scout_results table');
      console.log('   Title:', results.rows[0].title);
      console.log('   Platform:', results.rows[0].platform);
      console.log('   Relevance Score:', results.rows[0].relevanceScore);
    }
    
    console.log('\n✅ Database storage test completed successfully!');
    console.log('   The publisher workflow can now save results to the database.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testDatabaseStorage().catch(console.error);