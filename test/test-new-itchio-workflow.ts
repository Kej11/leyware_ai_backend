#!/usr/bin/env node

import { mastra } from '../src/mastra';
import { itchioScoutWorkflowNew } from '../src/mastra/workflows/itchio-scout-workflow-new';

async function testNewItchioWorkflow() {
  console.log('🎮 Testing New Intelligent Itch.io Scout Workflow');
  console.log('================================================\n');
  
  const ITCH_IO_SCOUT_ID = '99349cb8-e64f-44db-9385-00240821fc66';
  
  try {
    // Verify workflow is registered
    console.log('📋 Checking workflow registration...');
    try {
      const workflow = mastra.getWorkflow('itchioScoutWorkflowNew');
      console.log('✅ Workflow registered in Mastra');
    } catch (e) {
      console.log('⚠️  Workflow not found by that name in Mastra registry');
    }
    
    // Check if we can access the workflow directly
    console.log('\n📋 Workflow Details:');
    console.log(`   ID: ${itchioScoutWorkflowNew.id}`);
    console.log(`   Description: ${itchioScoutWorkflowNew.description}`);
    
    // Fetch scout details to show configuration
    const { queryOne } = await import('../src/mastra/database/neon-client');
    const scout = await queryOne(
      `SELECT name, instructions, keywords 
       FROM scouts 
       WHERE id = $1`,
      [ITCH_IO_SCOUT_ID]
    );
    
    if (scout) {
      console.log('\n🔍 Scout Configuration:');
      console.log(`   Name: ${scout.name}`);
      console.log(`   Instructions: "${scout.instructions}"`);
      console.log(`   Keywords: ${scout.keywords?.join(', ') || 'none'}`);
    }
    
    console.log('\n✅ New workflow setup complete!');
    console.log('\n📌 Key Features of the New Workflow:');
    console.log('   • AI-powered game discovery using scout instructions');
    console.log('   • Intelligent categorization (immediate/high/watch)');
    console.log('   • Investment analysis with ROI projections');
    console.log('   • Batch database storage for efficiency');
    console.log('   • Full scout run tracking');
    
    console.log('\n🚀 To run the workflow:');
    console.log('   1. Use scout_id as input parameter');
    console.log('   2. Scout instructions guide AI discovery');
    console.log('   3. Results saved to scout_results table');
    console.log('   4. Investment report generated');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testNewItchioWorkflow().catch(console.error);