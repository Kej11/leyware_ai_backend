import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import fs from 'fs/promises';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Schemas
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

async function publisherScoutWorkflow() {
  console.log('🎮 Publisher Investment Scout');
  console.log('=' + '='.repeat(50));
  
  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  try {
    console.log('🚀 Initializing...');
    await stagehand.init();
    const page = stagehand.page;
    
    if (!page) {
      throw new Error('Failed to initialize page');
    }
    
    // Step 1: Scan Trending Games
    console.log('\n📈 Step 1: Scanning Trending Games (new-and-popular)...');
    console.log('-'.repeat(50));
    
    await page.goto("https://itch.io/games/new-and-popular");
    await page.waitForLoadState('networkidle');
    
    const trendingOpportunities = [];
    
    for (let scroll = 0; scroll < 3; scroll++) {
      console.log(`  Scan ${scroll + 1}/3...`);
      
      const batch = await page.extract({
        instruction: `
          You are a game publisher investment scout looking for opportunities on itch.io.
          Analyze the games on this page and identify those with strong investment potential.
          
          Look for these positive signals:
          - High community engagement (lots of ratings, comments, downloads)
          - Professional presentation and polish
          - Unique or trending concepts that could scale
          - Active development (recent updates, developer responding to feedback)
          - Clear commercial viability (not just experiments or student projects)
          - Developer shows credibility and commitment
          - Games that fill a market gap or ride a trend
          - Strong visual identity or hook
          
          Avoid these red flags:
          - Abandoned projects (no updates in months)
          - Low effort or asset flips
          - Controversial or problematic content
          - Technical issues mentioned repeatedly in comments
          
          For each promising game, extract:
          - Title and FULL URL to the game page (format: https://developer.itch.io/game-name)
          - Developer name
          - Specific reason why this is an investment opportunity
          - Risk assessment (low/medium/high)
          - Urgency level (immediate/monitor/research)
          - Any visible metrics (rating, price, genre, engagement indicators)
          
          Focus on games that could significantly benefit from publisher support like:
          - Marketing and visibility
          - Porting to other platforms
          - Localization
          - Polish and QA
          - Sequel or franchise potential
          
          Be selective - only include games with real commercial potential.
        `,
        schema: z.object({
          opportunities: z.array(opportunitySchema)
        })
      });
      
      trendingOpportunities.push(...batch.opportunities);
      console.log(`    Found ${batch.opportunities.length} opportunities`);
      
      if (scroll < 2) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(2000);
      }
    }
    
    console.log(`  ✅ Total trending opportunities: ${trendingOpportunities.length}`);
    
    // Step 2: Scan Main Games Page
    console.log('\n🎮 Step 2: Scanning Main Games Page...');
    console.log('-'.repeat(50));
    
    await page.goto("https://itch.io/games");
    await page.waitForLoadState('networkidle');
    
    const mainPageOpportunities = [];
    
    for (let scroll = 0; scroll < 3; scroll++) {
      console.log(`  Scan ${scroll + 1}/3...`);
      
      const batch = await page.extract({
        instruction: `
          You are a game publisher investment scout.
          You've already found ${trendingOpportunities.length} trending games.
          
          Now look for DIFFERENT types of investment opportunities:
          
          1. ESTABLISHED SUCCESS - Games already successful but could grow with publisher:
             - Strong existing fanbase that could be expanded
             - Games ready for console ports or mobile adaptation
             - Successful games that could spawn sequels
             - Games with franchise potential
          
          2. HIDDEN GEMS - High quality with low visibility:
             - Excellent games buried in the catalog
             - Games from talented but unknown developers
             - Unique concepts that haven't found their audience
             - Games that need marketing more than development
          
          3. PROVEN DEVELOPERS:
             - Developers with multiple successful releases
             - Consistent quality and delivery
             - Ready for bigger projects
          
          Extract games that offer different value than trending games.
          For each opportunity, explain the specific publisher value proposition.
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
      console.log(`    Found ${batch.opportunities.length} opportunities`);
      
      if (scroll < 2) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(2000);
      }
    }
    
    console.log(`  ✅ Total main page opportunities: ${mainPageOpportunities.length}`);
    
    // Step 3: Analysis
    console.log('\n🔍 Step 3: Deep Investment Analysis...');
    console.log('-'.repeat(50));
    
    const allOpportunities = [...trendingOpportunities, ...mainPageOpportunities];
    console.log(`  Analyzing ${allOpportunities.length} total opportunities...`);
    
    const analysis = await page.extract({
      instruction: `
        As a senior game publisher investment analyst, review these ${allOpportunities.length} investment opportunities.
        
        Create an actionable investment report:
        
        1. IMMEDIATE ACTION (Contact within 24-48 hours):
           - Why the urgency?
           - Investment thesis
           - Recommended deal structure
           - Expected ROI (be specific)
           - First contact approach
        
        2. HIGH PRIORITY (Investigate within a week):
           - What makes them high priority?
           - Due diligence needed
           - Key questions to answer
        
        3. WATCH LIST (Monitor for 1-3 months):
           - What metrics to watch?
           - What would trigger action?
        
        Also identify:
        - MARKET TRENDS across opportunities
        - RED FLAGS or concerns
        - PORTFOLIO GAPS we're not seeing
        
        Be specific and actionable.
        
        Opportunities:
        ${JSON.stringify(allOpportunities, null, 2)}
      `,
      schema: analysisSchema
    });
    
    console.log(`  ✅ Analysis complete`);
    console.log(`     Immediate: ${analysis.immediateAction.length}`);
    console.log(`     High Priority: ${analysis.highPriority.length}`);
    console.log(`     Watch List: ${analysis.watchList.length}`);
    
    // Generate Report
    const report = {
      metadata: {
        runDate: new Date().toISOString(),
        sources: ['itch.io/games/new-and-popular', 'itch.io/games']
      },
      statistics: {
        totalScanned: allOpportunities.length,
        trending: trendingOpportunities.length,
        mainPage: mainPageOpportunities.length,
        immediate: analysis.immediateAction.length,
        highPriority: analysis.highPriority.length,
        watchList: analysis.watchList.length
      },
      immediateAction: analysis.immediateAction,
      highPriority: analysis.highPriority,
      watchList: analysis.watchList,
      insights: {
        trends: analysis.trends,
        redFlags: analysis.redFlags || []
      }
    };
    
    // Display Results
    console.log('\n' + '='.repeat(60));
    console.log('📈 PUBLISHER INVESTMENT REPORT');
    console.log('=' + '='.repeat(60));
    
    console.log('\n🚀 IMMEDIATE ACTION:');
    if (analysis.immediateAction.length > 0) {
      analysis.immediateAction.forEach((game, i) => {
        console.log(`\n${i + 1}. ${game.title} by ${game.developer}`);
        console.log(`   Thesis: ${game.investmentThesis}`);
        console.log(`   Deal: ${game.recommendedDeal}`);
        console.log(`   ROI: ${game.expectedROI}`);
        console.log(`   Contact: ${game.firstContact}`);
        console.log(`   URL: ${game.url}`);
      });
    } else {
      console.log('   None identified');
    }
    
    console.log('\n📊 HIGH PRIORITY:');
    analysis.highPriority.slice(0, 3).forEach((game, i) => {
      console.log(`${i + 1}. ${game.title} - ${game.whyPriority}`);
    });
    
    console.log('\n📈 TRENDS:');
    analysis.trends?.forEach(trend => {
      console.log(`   • ${trend}`);
    });
    
    console.log('\n📊 STATISTICS:');
    console.log(`   Total Analyzed: ${report.statistics.totalScanned}`);
    console.log(`   Immediate: ${report.statistics.immediate}`);
    console.log(`   High Priority: ${report.statistics.highPriority}`);
    console.log(`   Watch List: ${report.statistics.watchList}`);
    
    // Save report
    const reportPath = path.join(process.cwd(), `publisher-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved: ${reportPath}`);
    
    return report;
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await stagehand.close();
    console.log('\n✅ Complete!');
  }
}

// Run
publisherScoutWorkflow()
  .then(report => {
    console.log(`\n✨ Found ${report.statistics.immediate} immediate opportunities!`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });