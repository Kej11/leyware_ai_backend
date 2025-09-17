#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '.env.test') });

// Validate required environment variables
function validateEnvironment() {
  const required = ['OPENAI_API_KEY']; // Only need OpenAI for local mode
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n💡 Setup required:');
    console.error('   1. Get OpenAI API key from https://platform.openai.com');
    console.error('   2. Copy test/.env.test to test/.env and add your OpenAI key');
    console.error('   3. Stagehand will run locally using installed Playwright browsers');
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated (LOCAL mode)');
}

async function runTest() {
  console.log('🚀 Stagehand itch.io Agent Test Runner');
  console.log('=' .repeat(50));
  
  try {
    validateEnvironment();
    
    // Import and run the test
    const { StagehandItchioTest } = await import('./stagehand-agent-test.js');
    
    const test = new StagehandItchioTest();
    await test.runTest();
    
    console.log('\n✅ Test completed successfully!');
    console.log('📊 Check test/results/ for detailed reports and screenshots');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();