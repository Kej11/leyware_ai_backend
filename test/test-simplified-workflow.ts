#!/usr/bin/env node

import { mastra } from '../src/mastra';

async function testSimplifiedWorkflow() {
  console.log('🚀 Testing Simplified Publisher Scout Workflow');
  console.log('=============================================\n');
  
  // Use the itch.io scout ID from the database
  const ITCH_IO_SCOUT_ID = '99349cb8-e64f-44db-9385-00240821fc66';
  
  try {
    // Fetch scout configuration to display
    const { queryOne } = await import('../src/mastra/database/neon-client');
    const scout = await queryOne(
      `SELECT name, instructions, keywords 
       FROM scouts 
       WHERE id = $1`,
      [ITCH_IO_SCOUT_ID]
    );
    
    if (scout) {
      console.log('📋 Scout Configuration:');
      console.log(`   Name: ${scout.name}`);
      console.log(`   Instructions: "${scout.instructions}"`);
      console.log(`   Keywords: ${scout.keywords?.join(', ') || 'none'}\n`);
    }
    
    console.log('⏳ Starting simplified workflow...\n');
    
    // Create and run the workflow
    const run = await mastra.getWorkflow('publisherScoutWorkflow').createRunAsync();
    
    const result = await run.start({
      inputData: {
        scout_id: ITCH_IO_SCOUT_ID,
        headless: true,
        scrollCount: 1  // Quick test with 1 scroll
      }
    });
    
    if (result.status === 'success') {
      const output = result.result.output;
      console.log('✅ Workflow completed successfully!\n');
      
      console.log('📊 Results:');
      console.log(`   Total Games Found: ${output.report.statistics.totalGamesScanned}`);
      console.log(`   Immediate Actions: ${output.report.statistics.immediateActions}`);
      console.log(`   High Priority: ${output.report.statistics.highPriority}`);
      console.log(`   Watch List: ${output.report.statistics.watchList}`);
      
      console.log('\n💡 The scout instructions were passed directly to the browser agent');
      console.log('   which used them to find and categorize games.');
      
      if (output.reportPath) {
        console.log(`\n📄 Full report saved to: ${output.reportPath}`);
      }
      
    } else {
      console.error('❌ Workflow failed:', result.status);
      if (result.error) {
        console.error('Error:', result.error);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.log('\n' + '='.repeat(45));
}

// Run the test
testSimplifiedWorkflow().catch(console.error);