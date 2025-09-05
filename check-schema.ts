#!/usr/bin/env node

/**
 * Check the actual database schema
 */

import { config } from 'dotenv';
import { query } from './src/mastra/database/neon-client';

config();

async function checkSchema() {
  console.log('🔍 Checking actual database schema...\n');

  try {
    // Check scouts table columns
    const scoutsColumns = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'scouts' 
      ORDER BY ordinal_position
    `);

    console.log('📋 Scouts table columns:');
    console.log(scoutsColumns);

    // Check existing scout data
    console.log('\n📊 Existing scouts:');
    const scouts = await query(`SELECT * FROM scouts LIMIT 1`);
    console.log(scouts);

  } catch (error) {
    console.error('❌ Failed to check schema:', error);
    process.exit(1);
  }
}

checkSchema().catch(console.error);