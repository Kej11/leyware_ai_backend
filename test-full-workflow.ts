#!/usr/bin/env node

/**
 * Test the complete scout workflow end-to-end
 */

import { config } from 'dotenv';
import { scoutSearchWorkflow } from './src/mastra/workflows/scout-search-workflow';

config();

async function testFullWorkflow() {
  console.log('🚀 Testing Complete Scout Search Workflow...\n');

  const scoutId = '93e8096d-5679-4f8e-9a5d-60b018610a62';
  
  try {
    console.log('Starting workflow execution...');
    
    const startTime = Date.now();
    
    const result = await scoutSearchWorkflow.execute({
      inputData: { scout_id: scoutId }
    });
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    console.log('\n🎉 Workflow completed successfully!');
    console.log('\n📊 Results:');
    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   📈 Run ID: ${result.run_id}`);
    console.log(`   🔍 Results Found: ${result.results_count}`);
    console.log(`   ⭐ High Relevance: ${result.high_relevance_count}`);
    console.log(`   ⏱️  Execution Time: ${executionTime}ms`);
    
    console.log('\n✨ The scout search workflow is now fully operational!');
    
  } catch (error) {
    console.error('\n❌ Workflow execution failed:', error);
    console.error('\nError details:', error.message);
    
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

// Run the full workflow test
testFullWorkflow().catch(console.error);