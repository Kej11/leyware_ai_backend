#!/usr/bin/env npx tsx

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { mastra } from '../src/mastra/index';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Validate environment
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY not found in environment');
  console.error('   Please set OPENAI_API_KEY in test/.env file');
  process.exit(1);
}

async function runPublisherScout() {
  try {
    console.log('🚀 Starting Publisher Scout Workflow');
    console.log('   Using OpenAI API for analysis');
    console.log('   Scanning: new-and-popular + main games page');
    console.log('   With 3x scrolling per page (~400+ games total)');
    console.log('');
    
    // Execute the workflow using the workflow export directly
    const { publisherScoutWorkflow } = await import('../src/mastra/workflows/publisher-scout-workflow');
    const result = await publisherScoutWorkflow.execute({
      headless: false,
      scrollCount: 3,
      apiKey: process.env.OPENAI_API_KEY
    });
    
    if (result.success) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ WORKFLOW COMPLETED SUCCESSFULLY');
      console.log('=' + '='.repeat(60));
      console.log(`\nIdentified ${result.report.statistics.immediateActions} immediate investment opportunities!`);
      console.log(`Report saved to: ${result.reportPath}`);
    } else {
      console.error('\n❌ Workflow failed:', result.message);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error running publisher scout:', error);
    process.exit(1);
  }
}

// Run the workflow
console.log('=' + '='.repeat(60));
console.log('🎮 ITCH.IO PUBLISHER INVESTMENT SCOUT');
console.log('=' + '='.repeat(60));
console.log('');

runPublisherScout()
  .then(() => {
    console.log('\n👋 Goodbye!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });