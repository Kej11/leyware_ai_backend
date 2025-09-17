import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { Stagehand } from '@browserbasehq/stagehand';
import fs from 'fs/promises';
import path from 'path';
import {
  lookupScoutTool,
  createScoutRunTool,
  updateRunStatusTool,
  updateRunProgressTool,
  finalizeScoutRunTool,
  storeGameWithCommentsTool,
  batchStoreResultsTool
} from '../tools/database-tools';
import { execute } from '../database/neon-client';

// Schema definitions for opportunities and analysis
const opportunitySchema = z.object({
  title: z.string(),
  url: z.string(),
  developer: z.string(),
  whyInvest: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  urgency: z.enum(['immediate', 'monitor', 'research']),
  metrics: z.object({
    rating: z.string().optional(),
    engagement: z.string().optional(),
    genre: z.string().optional(),
    price: z.string().optional()
  }).optional()
});

const analysisSchema = z.object({
  immediateAction: z.array(z.object({
    title: z.string(),
    developer: z.string(),
    url: z.string(),
    investmentThesis: z.string(),
    recommendedDeal: z.string(),
    expectedROI: z.string(),
    firstContact: z.string()
  })),
  highPriority: z.array(z.object({
    title: z.string(),
    developer: z.string(),
    url: z.string(),
    whyPriority: z.string(),
    nextSteps: z.string()
  })),
  watchList: z.array(z.object({
    title: z.string(),
    developer: z.string(),
    url: z.string(),
    whatToWatch: z.string()
  })),
  trends: z.array(z.string()),
  redFlags: z.array(z.string()).optional()
});

// Input/Output schemas for workflow
const workflowInputSchema = z.object({
  scout_id: z.string().uuid().describe('Scout configuration ID from database'),
  headless: z.boolean().default(true),
  scrollCount: z.number().default(3)
});

const workflowOutputSchema = z.object({
  success: z.boolean(),
  run_id: z.string(),
  results_count: z.number(),
  high_relevance_count: z.number(),
  execution_time_ms: z.number(),
  // Additional fields for backward compatibility
  scout_run_id: z.string().optional(),
  report: z.object({
    metadata: z.object({
      runDate: z.string(),
      workflow: z.string(),
      version: z.string(),
      sources: z.array(z.string()),
      scout_id: z.string().optional(),
      scout_name: z.string().optional(),
      scout_instructions: z.string().optional()
    }),
    statistics: z.object({
      totalGamesScanned: z.number(),
      trendingGames: z.number(),
      establishedGames: z.number(),
      immediateActions: z.number(),
      highPriority: z.number(),
      watchList: z.number()
    }),
    immediateAction: z.array(z.any()),
    highPriority: z.array(z.any()),
    watchList: z.array(z.any()),
    insights: z.object({
      trends: z.array(z.string()),
      redFlags: z.array(z.string()),
      recommendations: z.array(z.string())
    })
  }),
  message: z.string(),
  reportPath: z.string().optional()
});

// Create step instances from database tools
const lookupScoutStep = createStep(lookupScoutTool);
const createScoutRunStep = createStep(createScoutRunTool);
const updateRunStatusStep = createStep(updateRunStatusTool);
const updateRunProgressStep = createStep(updateRunProgressTool);
const finalizeScoutRunStep = createStep(finalizeScoutRunTool);
const storeGameWithCommentsStep = createStep(storeGameWithCommentsTool);
const batchStoreResultsStep = createStep(batchStoreResultsTool);

// Helper function to transform publisher analysis to database format
// Only saves immediate action and high priority games (excludes watch list)
export function transformToScoutResults(analysis: any, scout: any) {
  const results: any[] = [];
  
  // Transform immediate action items with high relevance
  analysis.immediateAction.forEach((item: any) => {
    results.push({
      title: item.title,
      source_url: item.url,
      author: item.developer,
      author_url: null,
      content: `Investment Thesis: ${item.investmentThesis}\nRecommended Deal: ${item.recommendedDeal}\nExpected ROI: ${item.expectedROI}\nFirst Contact: ${item.firstContact}`,
      relevance_score: 0.9,
      engagement_score: 0.8,
      created_at: new Date().toISOString(),
      metadata: {
        category: 'immediate_action',
        expectedROI: item.expectedROI,
        recommendedDeal: item.recommendedDeal,
        firstContact: item.firstContact,
        investmentThesis: item.investmentThesis
      },
      platform: 'itch.io',
      analysis_reasoning: item.investmentThesis || 'High priority investment opportunity'
    });
  });
  
  // Transform high priority items with good relevance
  analysis.highPriority.forEach((item: any) => {
    results.push({
      title: item.title,
      source_url: item.url,
      author: item.developer,
      author_url: null,
      content: `Priority Reason: ${item.whyPriority}\nNext Steps: ${item.nextSteps}`,
      relevance_score: 0.7,
      engagement_score: 0.6,
      created_at: new Date().toISOString(),
      metadata: {
        category: 'high_priority',
        whyPriority: item.whyPriority,
        nextSteps: item.nextSteps
      },
      platform: 'itch.io',
      analysis_reasoning: item.whyPriority || 'Worth investigating further'
    });
  });
  
  // WATCH LIST ITEMS ARE NOT SAVED TO DATABASE
  // Only immediate action and high priority games are stored
  // Watch list is included in the report but not persisted
  
  return results;
}

// Step 1: Validate scout is for itch.io
const validateScoutStep = createStep({
  id: 'validate-scout',
  description: 'Validate scout configuration is for itch.io platform',
  inputSchema: z.object({
    scout: z.object({
      id: z.string(),
      name: z.string(),
      instructions: z.string(),
      keywords: z.array(z.string()),
      platform: z.string(),
      platform_config: z.any(),
      organization_id: z.string(),
      max_results: z.number(),
      quality_threshold: z.number(),
      frequency: z.string(),
      total_runs: z.number()
    }),
    success: z.boolean()
  }),
  outputSchema: z.object({
    scout: z.any(),
    config: workflowInputSchema
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const { scout } = inputData;
    
    if (scout.platform !== 'itch.io') {
      throw new Error(`Scout ${scout.name} is configured for ${scout.platform}, not itch.io`);
    }
    
    logger.info('Scout validated', {
      scoutId: scout.id,
      scoutName: scout.name,
      platform: scout.platform
    });
    
    return {
      scout,
      config: {
        scout_id: scout.id,
        headless: true,
        scrollCount: Math.min(Math.ceil(scout.max_results / 10), 5)
      }
    };
  }
});

// Step 2: Initialize Stagehand
const initializeStagehandStep = createStep({
  id: 'initialize-stagehand',
  description: 'Initialize Stagehand browser automation',
  inputSchema: z.object({
    scout: z.any(),
    config: workflowInputSchema
  }),
  outputSchema: z.object({
    stagehandReady: z.boolean(),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema,
    startTime: z.number()
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const { scout, config } = inputData;
    const startTime = Date.now();
    
    logger.info('Initializing Stagehand browser automation');
    
    // Create scout run record
    const runResult = await createScoutRunStep.execute({
      context: {
        scout_id: scout.id,
        status: 'running',
        metadata: {
          workflow: 'itchio-scout-new',
          config,
          startTime
        }
      },
      mastra
    });
    
    return {
      stagehandReady: true,
      scout,
      run_id: runResult.run_id,
      config,
      startTime
    };
  }
});

// Step 3: Scan trending games
const scanTrendingGamesStep = createStep({
  id: 'scan-trending-games',
  description: 'Scan trending games on itch.io new-and-popular page',
  inputSchema: z.object({
    stagehandReady: z.boolean(),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema,
    startTime: z.number().optional()
  }),
  outputSchema: z.object({
    trendingOpportunities: z.array(opportunitySchema),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const { scout, run_id, config } = inputData;
    
    logger.info('📈 Scanning trending games...', {
      scoutName: scout.name,
      runId: run_id
    });
    
    // Update run progress
    await updateRunProgressStep.execute({
      context: {
        run_id,
        status: 'searching',
        message: 'Scanning trending games on itch.io'
      },
      mastra
    });
    
    const stagehand = new Stagehand({
      env: "LOCAL",
      headless: config.headless
    });
    
    try {
      await stagehand.init();
      const page = stagehand.page;
      
      if (!page) {
        throw new Error('Failed to initialize Stagehand page');
      }
      
      await page.goto("https://itch.io/games/new-and-popular");
      await page.waitForLoadState('networkidle');
      
      const trendingOpportunities = [];
      
      for (let scroll = 0; scroll < config.scrollCount; scroll++) {
        logger.info(`  Scanning batch ${scroll + 1}/${config.scrollCount}...`);
        
        const batch = await page.extract({
          instruction: `
            ${scout.instructions}
            
            KEYWORDS TO LOOK FOR: ${scout.keywords.join(', ')}
            
            You are scanning the itch.io trending/new games page.
            Find games matching the above instructions and keywords.
            
            For each game that matches the criteria, extract:
            - Title and FULL URL to the game page
            - Developer name
            - Why this matches the scout instructions
            - Risk assessment (low/medium/high)
            - Urgency level (immediate/monitor/research)
            - Any visible metrics (ratings, comments, price, etc.)
          `,
          schema: z.object({
            opportunities: z.array(opportunitySchema)
          })
        });
        
        trendingOpportunities.push(...batch.opportunities);
        logger.info(`    Found ${batch.opportunities.length} opportunities`);
        
        if (scroll < config.scrollCount - 1) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
          await page.waitForTimeout(2000);
        }
      }
      
      await stagehand.close();
      
      logger.info(`  ✅ Total trending opportunities: ${trendingOpportunities.length}`);
      
      return {
        trendingOpportunities,
        scout,
        run_id,
        config
      };
      
    } catch (error) {
      await stagehand.close();
      throw error;
    }
  }
});

// Step 4: Scan main games page
const scanMainGamesStep = createStep({
  id: 'scan-main-games',
  description: 'Scan main games page for established and hidden gems',
  inputSchema: z.object({
    trendingOpportunities: z.array(opportunitySchema),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema
  }),
  outputSchema: z.object({
    trendingOpportunities: z.array(opportunitySchema),
    mainPageOpportunities: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const { trendingOpportunities, scout, run_id, config } = inputData;
    
    logger.info('🎮 Scanning main games page...', {
      scoutName: scout.name,
      runId: run_id
    });
    
    // Update run progress
    await updateRunProgressStep.execute({
      context: {
        run_id,
        status: 'searching',
        message: 'Scanning main games page'
      },
      mastra
    });
    
    const stagehand = new Stagehand({
      env: "LOCAL",
      headless: config.headless
    });
    
    try {
      await stagehand.init();
      const page = stagehand.page;
      
      if (!page) {
        throw new Error('Failed to initialize Stagehand page');
      }
      
      await page.goto("https://itch.io/games");
      await page.waitForLoadState('networkidle');
      
      const mainPageOpportunities = [];
      
      for (let scroll = 0; scroll < config.scrollCount; scroll++) {
        logger.info(`  Scanning batch ${scroll + 1}/${config.scrollCount}...`);
        
        const batch = await page.extract({
          instruction: `
            ${scout.instructions}
            
            KEYWORDS TO LOOK FOR: ${scout.keywords.join(', ')}
            
            You are scanning the itch.io main games page.
            You've already found ${trendingOpportunities.length} trending games.
            Now look for DIFFERENT games that match the scout instructions.
            
            Focus on finding:
            - Established games that could grow
            - Hidden gems with low visibility
            - Games from proven developers
            - Any other games matching the scout criteria
            
            For each game that matches, extract:
            - Title and FULL URL
            - Developer name
            - Why this matches the scout instructions
            - Investment type (established/hidden-gem/proven-dev/other)
            - Specific value or potential
          `,
          schema: z.object({
            opportunities: z.array(z.object({
              title: z.string(),
              url: z.string(),
              developer: z.string(),
              whyInvest: z.string(),
              investmentType: z.enum(['established', 'hidden-gem', 'portfolio', 'proven-dev']),
              specificValue: z.string()
            }))
          })
        });
        
        mainPageOpportunities.push(...batch.opportunities);
        logger.info(`    Found ${batch.opportunities.length} opportunities`);
        
        if (scroll < config.scrollCount - 1) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
          await page.waitForTimeout(2000);
        }
      }
      
      await stagehand.close();
      
      logger.info(`  ✅ Total main page opportunities: ${mainPageOpportunities.length}`);
      
      return {
        trendingOpportunities,
        mainPageOpportunities,
        scout,
        run_id,
        config
      };
      
    } catch (error) {
      await stagehand.close();
      throw error;
    }
  }
});

// Step 5: Analyze opportunities
const analyzeOpportunitiesStep = createStep({
  id: 'analyze-opportunities',
  description: 'Deep investment analysis of all opportunities',
  inputSchema: z.object({
    trendingOpportunities: z.array(opportunitySchema),
    mainPageOpportunities: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema
  }),
  outputSchema: z.object({
    analysis: analysisSchema,
    allOpportunities: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const { trendingOpportunities, mainPageOpportunities, scout, run_id, config } = inputData;
    
    logger.info('🔍 Performing deep investment analysis...', {
      scoutName: scout.name,
      runId: run_id
    });
    
    // Update run progress
    await updateRunProgressStep.execute({
      context: {
        run_id,
        status: 'analyzing',
        message: 'Performing deep investment analysis'
      },
      mastra
    });
    
    const allOpportunities = [...trendingOpportunities, ...mainPageOpportunities];
    logger.info(`  Analyzing ${allOpportunities.length} total opportunities...`);
    
    const stagehand = new Stagehand({
      env: "LOCAL",
      headless: true
    });
    
    try {
      await stagehand.init();
      const page = stagehand.page;
      
      if (!page) {
        throw new Error('Failed to initialize Stagehand page');
      }
      
      // Navigate to a blank page for analysis
      await page.goto("about:blank");
      
      const analysis = await page.extract({
        instruction: `
          ${scout.instructions}
          
          Review these ${allOpportunities.length} discovered games and categorize them based on the scout instructions above.
          
          Organize into:
          
          1. IMMEDIATE ACTION (Best matches for scout criteria):
             - Title, developer, URL
             - Why this is a top priority
             - Investment thesis
             - Recommended next steps
             - Expected ROI
             - First contact approach
          
          2. HIGH PRIORITY (Good matches worth investigating):
             - Title, developer, URL
             - Why it's worth investigating
             - Next steps needed
          
          3. WATCH LIST (Potential matches to monitor):
             - Title, developer, URL
             - What to watch for
          
          Also identify:
          - Market trends you observe
          - Any red flags or concerns
          
          Focus on games that best match the scout instructions.
          
          Games to analyze:
          ${JSON.stringify(allOpportunities, null, 2)}
        `,
        schema: analysisSchema
      });
      
      await stagehand.close();
      
      logger.info(`  ✅ Analysis complete`);
      logger.info(`     Immediate: ${analysis.immediateAction.length}`);
      logger.info(`     High Priority: ${analysis.highPriority.length}`);
      logger.info(`     Watch List: ${analysis.watchList.length}`);
      
      return {
        analysis,
        allOpportunities,
        scout,
        run_id,
        config
      };
      
    } catch (error) {
      await stagehand.close();
      throw error;
    }
  }
});

// Step 6: Store results in database using batch storage
const storeResultsStep = createStep({
  id: 'store-results',
  description: 'Store all discovered games in scout_results table',
  inputSchema: z.object({
    analysis: analysisSchema,
    allOpportunities: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema
  }),
  outputSchema: z.object({
    analysis: analysisSchema,
    allOpportunities: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema,
    storedCount: z.number(),
    success: z.boolean()
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const { analysis, allOpportunities, scout, run_id } = inputData;
    
    logger.info('💾 Storing high-value results in database...', {
      scoutId: scout.id,
      runId: run_id,
      totalOpportunities: allOpportunities.length,
      immediateActions: analysis.immediateAction.length,
      highPriority: analysis.highPriority.length,
      watchList: analysis.watchList.length,
      toStore: analysis.immediateAction.length + analysis.highPriority.length
    });
    
    try {
      // Transform only immediate and high priority results for database storage
      const dbResults = transformToScoutResults(analysis, scout);
      
      logger.info(`Storing ${dbResults.length} high-value games (watch list excluded)`, {
        immediateCount: analysis.immediateAction.length,
        highPriorityCount: analysis.highPriority.length,
        watchListCount: analysis.watchList.length,
        storingCount: dbResults.length
      });
      
      if (dbResults.length > 0) {
        // Use batch storage for immediate and high priority results only
        const storeResult = await batchStoreResultsStep.execute({
          context: {
            run_id,
            scout_id: scout.id,
            organization_id: scout.organization_id,
            results: dbResults
          },
          mastra,
          runtimeContext: {} as any
        });
        
        logger.info('Batch storage completed', {
          totalStored: storeResult.total_stored,
          batchCount: storeResult.batch_count,
          runId: run_id
        });
        
        // Update scout run with results count
        await execute(
          `UPDATE scout_runs 
           SET "resultsFound" = $2,
               "resultsProcessed" = $3
           WHERE id = $1`,
          [run_id, allOpportunities.length, storeResult.total_stored]
        );
        
        return {
          ...inputData,
          storedCount: storeResult.total_stored,
          success: true
        };
      } else {
        logger.warn('No results to store', {
          runId: run_id
        });
        
        return {
          ...inputData,
          storedCount: 0,
          success: true
        };
      }
    } catch (error) {
      logger.error('Failed to store results', {
        error: error instanceof Error ? error.message : String(error),
        runId: run_id
      });
      
      // Update scout run with error
      await execute(
        `UPDATE scout_runs 
         SET status = 'error',
             "errorMessage" = $2,
             "completedAt" = NOW()
         WHERE id = $1`,
        [run_id, error instanceof Error ? error.message : 'Storage failed']
      );
      
      return {
        ...inputData,
        storedCount: 0,
        success: false
      };
    }
  }
});

// Step 7: Generate report and finalize run
const generateReportStep = createStep({
  id: 'generate-report',
  description: 'Generate investment report and finalize scout run',
  inputSchema: z.object({
    analysis: analysisSchema,
    allOpportunities: z.array(z.any()),
    scout: z.any(),
    run_id: z.string(),
    config: workflowInputSchema,
    storedCount: z.number(),
    success: z.boolean(),
    startTime: z.number().optional()
  }),
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const { analysis, allOpportunities, scout, run_id, config, storedCount, success, startTime } = inputData;
    
    logger.info('📊 Generating investment report...');
    
    // Separate trending from main page opportunities
    const trendingCount = allOpportunities.filter(o => 'urgency' in o).length;
    const mainPageCount = allOpportunities.length - trendingCount;
    
    const report = {
      metadata: {
        runDate: new Date().toISOString(),
        workflow: 'publisher-scout',
        version: '3.0.0',
        sources: ['https://itch.io/games/new-and-popular', 'https://itch.io/games'],
        scout_id: scout.id,
        scout_name: scout.name,
        scout_instructions: scout.instructions
      },
      statistics: {
        totalGamesScanned: allOpportunities.length,
        trendingGames: trendingCount,
        establishedGames: mainPageCount,
        immediateActions: analysis.immediateAction.length,
        highPriority: analysis.highPriority.length,
        watchList: analysis.watchList.length
      },
      immediateAction: analysis.immediateAction,
      highPriority: analysis.highPriority,
      watchList: analysis.watchList,
      insights: {
        trends: analysis.trends,
        redFlags: analysis.redFlags || [],
        recommendations: [
          `Contact ${analysis.immediateAction.length} developers immediately`,
          `Schedule deep dives for ${analysis.highPriority.length} high-priority games`,
          `Set up monitoring for ${analysis.watchList.length} games on watch list`
        ]
      }
    };
    
    // Save report to file
    const reportPath = path.join(process.cwd(), `publisher-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    logger.info(`💾 Report saved to: ${reportPath}`);
    
    // Finalize scout run with proper status and counts
    try {
      await execute(
        `UPDATE scout_runs 
         SET status = $2,
             "completedAt" = NOW(),
             "resultsFound" = $3,
             "resultsProcessed" = $4,
             "runConfig" = $5
         WHERE id = $1`,
        [
          run_id,
          success ? 'completed' : 'error',
          allOpportunities.length,
          storedCount,
          JSON.stringify({
            report_path: reportPath,
            immediate_actions: analysis.immediateAction.length,
            high_priority: analysis.highPriority.length,
            watch_list: analysis.watchList.length,
            total_scanned: trendingCount + mainPageCount,
            scout_instructions: scout.instructions
          })
        ]
      );
      
      logger.info('Scout run finalized', {
        runId: run_id,
        status: success ? 'completed' : 'error',
        resultsFound: allOpportunities.length,
        resultsProcessed: storedCount
      });
    } catch (error) {
      logger.error('Failed to finalize scout run', {
        error: error instanceof Error ? error.message : String(error),
        runId: run_id
      });
    }
    
    // Display summary
    logger.info('');
    logger.info('=' + '='.repeat(60));
    logger.info('📈 PUBLISHER INVESTMENT REPORT SUMMARY');
    logger.info('=' + '='.repeat(60));
    
    logger.info('');
    logger.info('🚀 IMMEDIATE ACTION REQUIRED:');
    if (analysis.immediateAction.length > 0) {
      analysis.immediateAction.forEach((game, index) => {
        logger.info(`${index + 1}. ${game.title} by ${game.developer}`);
        logger.info(`   Thesis: ${game.investmentThesis}`);
        logger.info(`   Deal: ${game.recommendedDeal}`);
        logger.info(`   ROI: ${game.expectedROI}`);
      });
    } else {
      logger.info('   No immediate action items identified.');
    }
    
    logger.info('');
    logger.info('📊 STATISTICS:');
    logger.info(`   Total Games Analyzed: ${report.statistics.totalGamesScanned}`);
    logger.info(`   Immediate Opportunities: ${report.statistics.immediateActions} (saved to DB)`);
    logger.info(`   High Priority: ${report.statistics.highPriority} (saved to DB)`);
    logger.info(`   Watch List: ${report.statistics.watchList} (report only, not saved)`);
    logger.info(`   Total Saved to Database: ${report.statistics.immediateActions + report.statistics.highPriority}`);
    
    // Return format consistent with other scout workflows
    const executionTime = startTime ? Date.now() - startTime : 0;
    
    return {
      success: success && storedCount > 0,
      run_id,
      results_count: storedCount,
      high_relevance_count: analysis.immediateAction.length,
      execution_time_ms: executionTime,
      // Additional fields for compatibility
      scout_run_id: run_id,
      report,
      message: `Found ${analysis.immediateAction.length} immediate investment opportunities`,
      reportPath
    };
  }
});

// Create the workflow - New intelligent itch.io scout with AI analysis
export const itchioScoutWorkflowNew = createWorkflow({
  id: 'itchio-scout-workflow-new',
  description: 'Intelligent itch.io scout with AI-powered game discovery and investment analysis',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema
})
  .then(lookupScoutStep)
  .then(validateScoutStep)
  .then(initializeStagehandStep)
  .then(scanTrendingGamesStep)
  .then(scanMainGamesStep)
  .then(analyzeOpportunitiesStep)
  .then(storeResultsStep)
  .then(generateReportStep)
  .commit();