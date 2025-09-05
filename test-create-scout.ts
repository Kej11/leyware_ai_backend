#!/usr/bin/env node

/**
 * Create a test scout with all required fields populated
 */

import { config } from 'dotenv';
import { execute } from './src/mastra/database/neon-client';

config();

async function createTestScout() {
  console.log('🔧 Creating test scout with all required fields...\n');

  try {
    const scoutData = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', // New UUID for test scout
      name: 'Gaming Content Scout',
      instructions: 'Find engaging gaming content, news, and discussions about indie games and game development.',
      keywords: ['indie games', 'game development', 'gaming news', 'game design'],
      platform: 'reddit',
      platform_config: JSON.stringify({
        subreddits: ['gamedev', 'IndieGaming', 'gaming'],
        sort_by: 'hot',
        time_filter: 'day'
      }),
      organization_id: 'org-12345',
      max_results: 20,
      quality_threshold: 0.7,
      frequency: 'daily',
      total_runs: 0,
      is_running: false
    };

    await execute(
      `INSERT INTO scouts (
        id, name, instructions, keywords, platform, platform_config,
        organization_id, max_results, quality_threshold, frequency,
        total_runs, is_running, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        instructions = EXCLUDED.instructions,
        keywords = EXCLUDED.keywords,
        max_results = EXCLUDED.max_results,
        quality_threshold = EXCLUDED.quality_threshold,
        updated_at = NOW()`,
      [
        scoutData.id,
        scoutData.name,
        scoutData.instructions,
        scoutData.keywords,
        scoutData.platform,
        scoutData.platform_config,
        scoutData.organization_id,
        scoutData.max_results,
        scoutData.quality_threshold,
        scoutData.frequency,
        scoutData.total_runs,
        scoutData.is_running
      ]
    );

    console.log(`✅ Created test scout: ${scoutData.name}`);
    console.log(`   ID: ${scoutData.id}`);
    console.log(`   Platform: ${scoutData.platform}`);
    console.log(`   Max Results: ${scoutData.max_results}`);
    console.log(`   Quality Threshold: ${scoutData.quality_threshold}`);

    return scoutData.id;

  } catch (error) {
    console.error('❌ Failed to create test scout:', error);
    process.exit(1);
  }
}

// Run the test
createTestScout().catch(console.error);