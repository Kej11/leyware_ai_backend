import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import fs from 'fs/promises';

// Load environment variables from test directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Schema for publisher-focused game discovery
const publisherGameSchema = z.object({
  title: z.string(),
  url: z.string().optional(), // Made optional since extraction might fail
  developer: z.string(),
  price: z.string().optional(),
  downloadCount: z.string().optional(),
  rating: z.string().optional(),
  badges: z.array(z.string()).optional(),
  lastUpdated: z.string().optional(),
  hasDemo: z.boolean().optional(),
  platforms: z.array(z.string()).optional(),
  genre: z.string().optional(),
  description: z.string().optional()
});

const investmentAnalysisSchema = z.object({
  title: z.string(),
  url: z.string(),
  developer: z.string(),
  uniqueSellingPoint: z.string(),
  developmentStage: z.enum(["prototype", "demo", "early-access", "released", "unknown"]),
  communitySize: z.enum(["small", "growing", "active", "very-active", "unknown"]),
  investmentPotential: z.number().min(1).max(10),
  reasonsToInvest: z.array(z.string()),
  risks: z.array(z.string()).optional(),
  estimatedAudience: z.string().optional()
});

const detailedAnalysisSchema = z.object({
  gameInfo: z.object({
    title: z.string(),
    url: z.string(),
    developer: z.string(),
    description: z.string().optional(),
    longDescription: z.string().optional()
  }),
  businessMetrics: z.object({
    teamSize: z.string().optional(),
    fundingStatus: z.string().optional(),
    monetizationModel: z.string(),
    platforms: z.array(z.string()),
    hasMultiplayer: z.boolean(),
    estimatedRevenue: z.string().optional()
  }),
  communityMetrics: z.object({
    totalDownloads: z.string().optional(),
    reviewCount: z.string().optional(),
    averageRating: z.string().optional(),
    communityActivity: z.enum(["low", "moderate", "high", "very-high", "unknown"]),
    recentComments: z.number().optional(),
    socialMediaLinks: z.array(z.string()).optional()
  }),
  investmentReadiness: z.object({
    hasBusinessContact: z.boolean(),
    hasPressKit: z.boolean(),
    hasRoadmap: z.boolean(),
    professionalPresentation: z.boolean(),
    developmentMaturity: z.enum(["early", "progressing", "mature", "complete"]),
    investmentScore: z.number().min(1).max(10),
    nextSteps: z.array(z.string()).optional()
  })
});

// Calculate publisher interest score
function calculatePublisherScore(game: any): number {
  let score = 0;
  
  // Commercial viability (max 3 points)
  if (game.price && game.price !== "" && !game.price.toLowerCase().includes("free")) {
    score += 2;
  }
  if (game.price?.includes("$")) {
    score += 1;
  }
  
  // Engagement metrics (max 3 points)
  if (game.downloadCount && parseInt(game.downloadCount.replace(/\D/g, '')) > 1000) {
    score += 1;
  }
  if (game.rating && parseFloat(game.rating) >= 4.0) {
    score += 1;
  }
  if (game.badges && game.badges.length > 0) {
    score += 1;
  }
  
  // Development activity (max 2 points)
  if (game.hasDemo) {
    score += 1;
  }
  if (game.lastUpdated && game.lastUpdated.includes("202")) {
    score += 1;
  }
  
  // Platform potential (max 2 points)
  if (game.platforms && game.platforms.length > 1) {
    score += 1;
  }
  if (game.genre && !["test", "other", "misc"].includes(game.genre.toLowerCase())) {
    score += 1;
  }
  
  return Math.min(score, 10);
}

// Main publisher discovery function
async function publisherGameDiscovery() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    console.log('🎮 Publisher Game Discovery System');
    console.log('=' + '='.repeat(50));
    console.log('🚀 Initializing Stagehand...');
    await stagehand.init();
    console.log('✅ Stagehand initialized successfully.\n');

    const page = stagehand.page;
    if (!page) {
      throw new Error('Failed to get page instance from Stagehand');
    }

    // Phase 1: Navigate to high-quality games section
    console.log('📍 Phase 1: Initial Discovery');
    console.log('-'.repeat(50));
    console.log('Navigating to top-rated games for quality filtering...');
    await page.goto("https://itch.io/games/top-rated");
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded\n');

    // Phase 2: Progressive discovery with scrolling
    console.log('📊 Phase 2: Progressive Game Discovery');
    console.log('-'.repeat(50));
    
    const allGames = new Map();
    const maxScrolls = 3;
    
    for (let scroll = 0; scroll <= maxScrolls; scroll++) {
      console.log(`\n🔄 Discovery round ${scroll + 1}/${maxScrolls + 1}`);
      
      // Extract games with publisher-relevant metrics
      const batch = await page.extract({
        instruction: `
          Extract games from this page. For each game, include:
          1. The game title
          2. The full URL to the game page (format: https://developer.itch.io/game-name)
          3. The developer name
          4. The price if visible
          5. The rating if visible
          6. The genre if visible
          
          Focus on games that would interest a publisher:
          - Games with ratings above 4.0
          - Games with visible prices (commercial)
          - Games with professional presentation
        `,
        schema: z.object({
          games: z.array(publisherGameSchema)
        })
      });
      
      // Process and score games
      let newGames = 0;
      batch.games.forEach(game => {
        // Use title as key if URL is missing
        const key = game.url || game.title;
        if (!allGames.has(key)) {
          const scoredGame = {
            ...game,
            url: game.url || `https://itch.io/search?q=${encodeURIComponent(game.title)}`,
            publisherScore: calculatePublisherScore(game),
            discoveryRound: scroll + 1
          };
          allGames.set(key, scoredGame);
          newGames++;
        }
      });
      
      console.log(`  ✅ Found ${batch.games.length} games, ${newGames} new unique`);
      console.log(`  📈 Total unique games: ${allGames.size}`);
      
      // Scroll for more games (except on last iteration)
      if (scroll < maxScrolls) {
        console.log('  📜 Scrolling for more games...');
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 2);
        });
        await page.waitForTimeout(2000);
      }
    }

    // Phase 3: Filter and rank by publisher interest
    console.log('\n🎯 Phase 3: Investment Opportunity Analysis');
    console.log('-'.repeat(50));
    
    const gamesArray = Array.from(allGames.values());
    const highPotentialGames = gamesArray
      .filter(game => game.publisherScore >= 5)
      .sort((a, b) => b.publisherScore - a.publisherScore)
      .slice(0, 20);
    
    console.log(`\n📊 Filtered to top ${highPotentialGames.length} high-potential games`);
    
    // Analyze investment potential
    console.log('\n🔍 Analyzing investment potential...');
    const investmentAnalysis = await page.extract({
      instruction: `
        Analyze these games for investment potential from a publisher perspective:
        ${highPotentialGames.map(g => `- ${g.title} by ${g.developer}`).join('\n')}
        
        For each game, evaluate:
        - Unique selling points and market differentiation
        - Development stage and readiness for investment
        - Community size and engagement level
        - Investment potential score (1-10)
        - Key reasons to invest
        - Potential risks or concerns
        - Estimated target audience size
      `,
      schema: z.object({
        analyses: z.array(investmentAnalysisSchema)
      })
    });
    
    console.log(`✅ Completed investment analysis for ${investmentAnalysis.analyses.length} games`);

    // Phase 4: Deep dive on top 5 candidates
    console.log('\n🔬 Phase 4: Deep Analysis of Top Candidates');
    console.log('-'.repeat(50));
    
    const topCandidates = investmentAnalysis.analyses
      .sort((a, b) => b.investmentPotential - a.investmentPotential)
      .slice(0, 5);
    
    const detailedReports = [];
    
    for (let i = 0; i < topCandidates.length; i++) {
      const candidate = topCandidates[i];
      console.log(`\n🎮 Analyzing candidate ${i + 1}/${topCandidates.length}: ${candidate.title}`);
      
      try {
        // Navigate to game page
        await page.goto(candidate.url);
        await page.waitForLoadState('networkidle');
        
        // Extract detailed publisher-relevant information
        const detailedAnalysis = await page.extract({
          instruction: `
            Extract comprehensive publisher-relevant information about this game:
            
            Business Information:
            - Team size and composition
            - Funding status or history
            - Monetization model (free, paid, freemium, etc.)
            - Supported platforms
            - Multiplayer capabilities
            
            Community Metrics:
            - Total downloads or sales
            - Number of reviews/ratings
            - Average rating score
            - Community activity level
            - Recent comments or engagement
            - Social media presence
            
            Investment Readiness:
            - Professional presentation quality
            - Availability of business contact
            - Press kit availability
            - Development roadmap
            - Overall maturity and polish
            - Investment score (1-10)
            - Recommended next steps for publisher
          `,
          schema: detailedAnalysisSchema
        });
        
        detailedReports.push({
          ...candidate,
          detailed: detailedAnalysis
        });
        
        console.log(`  ✅ Investment Score: ${detailedAnalysis.investmentReadiness.investmentScore}/10`);
        console.log(`  💰 Monetization: ${detailedAnalysis.businessMetrics.monetizationModel}`);
        console.log(`  👥 Community: ${detailedAnalysis.communityMetrics.communityActivity}`);
        
      } catch (error) {
        console.log(`  ⚠️ Could not analyze ${candidate.title}: ${error.message}`);
      }
    }

    // Phase 5: Generate final report
    console.log('\n📈 Phase 5: Final Investment Report');
    console.log('=' + '='.repeat(50));
    
    const report = {
      metadata: {
        scanDate: new Date().toISOString(),
        platform: 'itch.io',
        section: 'top-rated',
        totalGamesScanned: allGames.size,
        highPotentialIdentified: highPotentialGames.length,
        deepAnalysisCompleted: detailedReports.length
      },
      topInvestmentOpportunities: detailedReports
        .filter(r => r.detailed.investmentReadiness.investmentScore >= 7)
        .map(r => ({
          title: r.title,
          developer: r.developer,
          url: r.url,
          investmentScore: r.detailed.investmentReadiness.investmentScore,
          monetization: r.detailed.businessMetrics.monetizationModel,
          community: r.detailed.communityMetrics.communityActivity,
          stage: r.developmentStage,
          uniqueValue: r.uniqueSellingPoint,
          reasonsToInvest: r.reasonsToInvest,
          nextSteps: r.detailed.investmentReadiness.nextSteps
        })),
      emergingOpportunities: detailedReports
        .filter(r => r.detailed.investmentReadiness.investmentScore >= 5 && r.detailed.investmentReadiness.investmentScore < 7)
        .map(r => ({
          title: r.title,
          developer: r.developer,
          url: r.url,
          potential: r.investmentPotential,
          risks: r.risks,
          whatTheyNeed: r.detailed.investmentReadiness.nextSteps
        })),
      statistics: {
        averageInvestmentScore: detailedReports.reduce((sum, r) => sum + r.detailed.investmentReadiness.investmentScore, 0) / detailedReports.length,
        gamesWithDemos: highPotentialGames.filter(g => g.hasDemo).length,
        paidGames: highPotentialGames.filter(g => g.price?.includes('$')).length,
        earlyAccessGames: investmentAnalysis.analyses.filter(a => a.developmentStage === 'early-access').length,
        highCommunityEngagement: detailedReports.filter(r => ['high', 'very-high'].includes(r.detailed.communityMetrics.communityActivity)).length
      }
    };

    // Save report to file
    const reportPath = path.join(__dirname, `publisher-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);

    // Display summary
    console.log('\n🎯 TOP INVESTMENT OPPORTUNITIES:');
    console.log('=' + '='.repeat(50));
    
    report.topInvestmentOpportunities.forEach((opp, index) => {
      console.log(`\n${index + 1}. ${opp.title}`);
      console.log(`   Developer: ${opp.developer}`);
      console.log(`   Investment Score: ${opp.investmentScore}/10`);
      console.log(`   Stage: ${opp.stage}`);
      console.log(`   Monetization: ${opp.monetization}`);
      console.log(`   Community: ${opp.community}`);
      console.log(`   Why Invest:`);
      opp.reasonsToInvest?.slice(0, 3).forEach(reason => {
        console.log(`     • ${reason}`);
      });
      console.log(`   URL: ${opp.url}`);
    });

    console.log('\n📊 SUMMARY STATISTICS:');
    console.log('-'.repeat(50));
    console.log(`Total Games Analyzed: ${report.metadata.totalGamesScanned}`);
    console.log(`High Potential Games: ${report.metadata.highPotentialIdentified}`);
    console.log(`Investment Opportunities: ${report.topInvestmentOpportunities.length}`);
    console.log(`Average Investment Score: ${report.statistics.averageInvestmentScore.toFixed(1)}/10`);
    console.log(`Games with Demos: ${report.statistics.gamesWithDemos}`);
    console.log(`Paid Games: ${report.statistics.paidGames}`);
    console.log(`Early Access: ${report.statistics.earlyAccessGames}`);
    console.log(`High Community Engagement: ${report.statistics.highCommunityEngagement}`);

    return report;

  } catch (error) {
    console.error('❌ Error during discovery:', error);
    throw error;
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('\n🧹 Stagehand closed.');
    }
  }
}

// Run the discovery system
publisherGameDiscovery()
  .then(report => {
    console.log('\n✅ Publisher discovery completed successfully!');
    console.log(`Found ${report.topInvestmentOpportunities.length} investment opportunities.`);
  })
  .catch(error => {
    console.error('\n❌ Publisher discovery failed:', error);
    process.exit(1);
  });