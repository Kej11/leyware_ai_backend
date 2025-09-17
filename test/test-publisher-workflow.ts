#!/usr/bin/env node

import { mastra } from '../src/mastra';
import { publisherScoutWorkflow } from '../src/mastra/workflows/publisher-scout-workflow';

async function testPublisherWorkflow() {
  console.log('🚀 Testing Publisher Scout Workflow with Scout Configuration');
  
  // Use the itch.io scout ID from the database
  const ITCH_IO_SCOUT_ID = '99349cb8-e64f-44db-9385-00240821fc66';
  
  try {
    console.log(`📋 Using Scout ID: ${ITCH_IO_SCOUT_ID}`);
    console.log('⏳ Starting workflow execution...\n');
    
    // Create a workflow run
    const run = await mastra.getWorkflow('publisher-scout-workflow').createRunAsync();
    
    // Start the workflow with input data
    const result = await run.start({
      inputData: {
        scout_id: ITCH_IO_SCOUT_ID,
        headless: true,
        scrollCount: 2  // Limit for testing
      }
    });
    
    if (result.status === 'success') {
      const output = result.result.output;
      console.log('\n✅ Workflow completed successfully!');
      console.log(`📊 Scout Run ID: ${output.scout_run_id}`);
      console.log(`📄 Report saved to: ${output.reportPath}`);
      console.log(`🎯 Immediate opportunities: ${output.report.statistics.immediateActions}`);
      console.log(`📌 High priority: ${output.report.statistics.highPriority}`);
      console.log(`👀 Watch list: ${output.report.statistics.watchList}`);
      console.log('\n📋 Scout Configuration Used:');
      console.log(`   Name: ${output.report.metadata.scout_name}`);
      console.log(`   Instructions: ${output.report.metadata.scout_instructions}`);
    } else {
      console.error('❌ Workflow failed:', result.status);
      if (result.error) {
        console.error('Error details:', result.error);
      }
    }
  } catch (error) {
    console.error('❌ Error executing workflow:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testPublisherWorkflow().catch(console.error);