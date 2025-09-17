#!/usr/bin/env node

import { mastra } from '../src/mastra';
import { publisherScoutWorkflow } from '../src/mastra/workflows/publisher-scout-workflow';

async function testAdaptiveWorkflow() {
  console.log('🚀 Testing Adaptive Publisher Scout Workflow');
  console.log('============================================\n');
  
  // Use the itch.io scout ID from the database
  const ITCH_IO_SCOUT_ID = '99349cb8-e64f-44db-9385-00240821fc66';
  
  try {
    // First, let's check the scout configuration
    console.log('📋 Fetching Scout Configuration...');
    const { query } = await import('../src/mastra/database/neon-client');
    const scouts = await query(
      `SELECT name, instructions, "qualityThreshold" as quality_threshold, keywords 
       FROM scouts 
       WHERE id = $1`,
      [ITCH_IO_SCOUT_ID]
    );
    
    if (scouts.length > 0) {
      const scout = scouts[0];
      console.log(`\n📌 Scout Details:`);
      console.log(`   Name: ${scout.name}`);
      console.log(`   Instructions: "${scout.instructions}"`);
      console.log(`   Quality Threshold: ${scout.quality_threshold}`);
      console.log(`   Keywords: ${scout.keywords?.join(', ') || 'none'}`);
      
      // Determine mode based on scout config
      const isExploratory = scout.quality_threshold < 0.6 || 
                          scout.instructions.toLowerCase().includes('any');
      console.log(`   Mode: ${isExploratory ? '🔍 EXPLORATORY' : '🎯 SELECTIVE'}`);
      
      if (isExploratory) {
        console.log('\n   ℹ️  Exploratory mode active:');
        console.log('      - Relaxed filtering criteria');
        console.log('      - Including experimental games');
        console.log('      - Lower quality threshold applied');
        console.log('      - Casting wider net for discoveries');
      }
    }
    
    console.log('\n⏳ Starting workflow execution...\n');
    
    // Create and run the workflow
    const run = await mastra.getWorkflow('publisherScoutWorkflow').createRunAsync();
    
    const result = await run.start({
      inputData: {
        scout_id: ITCH_IO_SCOUT_ID,
        headless: true,
        scrollCount: 1  // Just 1 scroll for quick testing
      }
    });
    
    if (result.status === 'success') {
      const output = result.result.output;
      console.log('\n✅ Workflow completed successfully!');
      console.log('=' + '='.repeat(50));
      
      console.log('\n📊 Execution Summary:');
      console.log(`   Scout Run ID: ${output.scout_run_id || 'N/A'}`);
      console.log(`   Report Path: ${output.reportPath || 'N/A'}`);
      console.log(`   Evaluation Mode: ${output.report.metadata.mode || 'unknown'}`);
      console.log(`   Original Threshold: ${output.report.metadata.quality_threshold}`);
      console.log(`   Adjusted Threshold: ${output.report.metadata.adjusted_threshold}`);
      
      console.log('\n📈 Discovery Statistics:');
      console.log(`   Total Games Analyzed: ${output.report.statistics.totalGamesScanned}`);
      console.log(`   Trending Games: ${output.report.statistics.trendingGames}`);
      console.log(`   Established Games: ${output.report.statistics.establishedGames}`);
      
      console.log('\n🎯 Categorization Results:');
      console.log(`   Immediate Actions: ${output.report.statistics.immediateActions}`);
      console.log(`   High Priority: ${output.report.statistics.highPriority}`);
      console.log(`   Watch List: ${output.report.statistics.watchList}`);
      
      if (output.report.insights?.trends?.length > 0) {
        console.log('\n🔮 Market Trends:');
        output.report.insights.trends.forEach(trend => {
          console.log(`   - ${trend}`);
        });
      }
      
      // Check if exploratory mode found more games
      const totalFound = output.report.statistics.immediateActions + 
                        output.report.statistics.highPriority + 
                        output.report.statistics.watchList;
      
      if (output.report.metadata.mode === 'exploratory') {
        console.log('\n🔍 Exploratory Mode Results:');
        console.log(`   Total opportunities found: ${totalFound}`);
        if (totalFound > 10) {
          console.log('   ✓ Successfully cast a wide net!');
        } else if (totalFound > 5) {
          console.log('   ✓ Found a moderate number of opportunities');
        } else {
          console.log('   ⚠️  Found fewer opportunities than expected');
        }
      }
      
      console.log('\n📋 Scout Configuration Used:');
      console.log(`   Name: ${output.report.metadata.scout_name}`);
      console.log(`   Instructions: "${output.report.metadata.scout_instructions}"`);
      console.log(`   Evaluation: ${output.report.metadata.evaluation_mode}`);
      
    } else {
      console.error('\n❌ Workflow failed:', result.status);
      if (result.error) {
        console.error('Error details:', result.error);
      }
    }
  } catch (error) {
    console.error('\n❌ Error executing workflow:', error);
    console.error('Stack trace:', error.stack);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('Test completed!');
}

// Run the test
testAdaptiveWorkflow().catch(console.error);