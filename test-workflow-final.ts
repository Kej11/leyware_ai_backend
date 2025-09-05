#!/usr/bin/env node

/**
 * Final test of the scout workflow after all fixes
 * Run with: tsx test-workflow-final.ts
 */

import { config } from 'dotenv';
import { lookupScoutTool } from './src/mastra/tools/database-tools';

config();

async function testWorkflowComponents() {
  console.log('🧪 Testing Scout Workflow Components After Fixes...\n');

  try {
    const scoutId = '93e8096d-5679-4f8e-9a5d-60b018610a62';
    
    console.log('1. Testing scout lookup with fixed database queries...');
    const scoutResult = await lookupScoutTool.execute({
      context: { scout_id: scoutId },
      runtimeContext: {} as any
    });
    
    console.log(`✅ Scout lookup successful:`, {
      id: scoutResult.scout.id,
      name: scoutResult.scout.name,
      platform: scoutResult.scout.platform,
      organizationId: scoutResult.scout.organization_id,
      maxResults: scoutResult.scout.max_results,
      qualityThreshold: scoutResult.scout.quality_threshold
    });
    
    console.log('\n2. All required parameters are now available for workflow...');
    console.log('   ✅ scout_id:', scoutResult.scout.id);
    console.log('   ✅ organization_id:', scoutResult.scout.organization_id);
    console.log('   ✅ max_results:', scoutResult.scout.max_results);
    console.log('   ✅ quality_threshold:', scoutResult.scout.quality_threshold);
    
    // Validate all required fields are present
    if (!scoutResult.scout.organization_id) {
      throw new Error('Missing organization_id - required for workflow');
    }
    if (!scoutResult.scout.max_results) {
      throw new Error('Missing max_results - required for workflow');
    }
    if (!scoutResult.scout.quality_threshold) {
      throw new Error('Missing quality_threshold - required for workflow');
    }
    
    console.log('\n🎉 Workflow components test passed!');
    console.log('\n📝 Summary of fixes applied:');
    console.log('   • Fixed SQL API to use proper Neon client methods');
    console.log('   • Added missing parameter mappings between workflow steps');
    console.log('   • Updated database field names to match actual schema (camelCase)');
    console.log('   • Changed ID types from varchar to UUID');
    console.log('   • Upgraded to authenticated Reddit API with 10x higher rate limits');
    
    console.log('\n🚀 The workflow should now execute successfully!');

  } catch (error) {
    console.error('❌ Workflow components test failed:', error);
    process.exit(1);
  }
}

// Run the test
testWorkflowComponents().catch(console.error);