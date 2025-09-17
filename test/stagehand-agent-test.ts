import { Stagehand } from '@browserbasehq/stagehand';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  headless: false, // Set to true for CI/CD
  debugMode: true,
  screenshotPath: path.join(__dirname, 'results', 'screenshots'),
  logsPath: path.join(__dirname, 'results', 'logs'),
  reportsPath: path.join(__dirname, 'results', 'reports'),
  testTimeout: 300000, // 5 minutes
};

interface TestResult {
  phase: string;
  status: 'success' | 'error' | 'partial';
  duration: number;
  actions: string[];
  screenshots: string[];
  agentOutput: string;
  error?: string;
}

class StagehandItchioTest {
  private stagehand: Stagehand;
  private testResults: TestResult[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Stagehand for itch.io publisher test...');
    
    this.stagehand = new Stagehand({
      env: "LOCAL", // Run locally instead of using Browserbase
      headless: TEST_CONFIG.headless,
      verbose: TEST_CONFIG.debugMode ? 3 : 1,
      debugDom: TEST_CONFIG.debugMode,
      enableCaching: false,
      domSettleTimeoutMs: 3000,
      logger: (message: any) => {
        console.log(`[Stagehand] ${JSON.stringify(message)}`);
        this.logToFile('stagehand.log', `${new Date().toISOString()} - ${JSON.stringify(message)}`);
      },
    });

    await this.stagehand.init();
    console.log('✅ Stagehand initialized successfully in LOCAL mode');
  }

  private async takeScreenshot(filename: string): Promise<string> {
    const screenshotPath = path.join(TEST_CONFIG.screenshotPath, `${Date.now()}_${filename}`);
    await this.stagehand.page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  }

  private logToFile(filename: string, content: string): void {
    const logPath = path.join(TEST_CONFIG.logsPath, filename);
    fs.appendFileSync(logPath, content + '\n');
  }

  private async executeAgentPhase(
    phaseName: string,
    instruction: string,
    expectedOutcome: string
  ): Promise<TestResult> {
    console.log(`\n🎯 Starting Phase: ${phaseName}`);
    console.log(`📋 Instruction: ${instruction}`);
    console.log(`🎯 Expected: ${expectedOutcome}`);

    const phaseStartTime = Date.now();
    const actions: string[] = [];
    const screenshots: string[] = [];
    let agentOutput = '';
    let status: 'success' | 'error' | 'partial' = 'success';
    let error: string | undefined;

    try {
      // Take initial screenshot
      const initialScreenshot = await this.takeScreenshot(`${phaseName}_start.png`);
      screenshots.push(initialScreenshot);

      // Create agent with publisher persona
      const agent = this.stagehand.agent({
        provider: "openai",
        model: "computer-use-preview",
        instructions: `You are an experienced video game publisher and investor looking for promising indie games to invest in or publish. 
        
        You have a keen eye for:
        - Games with commercial potential
        - Unique and innovative gameplay mechanics
        - Strong visual appeal and production quality
        - Active and engaged communities
        - Developers who show professionalism and dedication
        
        When evaluating games, consider:
        - Market viability and target audience
        - Competition and differentiation
        - Production quality and polish
        - Developer track record and communication
        - Community engagement and feedback
        - Monetization potential
        
        Be thorough in your investigation but also efficient. Document your reasoning for each decision.`,
      });

      console.log(`🤖 Executing agent instruction...`);
      this.logToFile(`${phaseName}.log`, `Starting phase: ${phaseName}`);
      this.logToFile(`${phaseName}.log`, `Instruction: ${instruction}`);

      // Execute the agent instruction
      const result = await agent.execute(instruction, {
        onActionComplete: (action: any) => {
          const actionDescription = `Action: ${action.type} - ${action.description || 'No description'}`;
          actions.push(actionDescription);
          console.log(`🔧 ${actionDescription}`);
          this.logToFile(`${phaseName}.log`, actionDescription);
        },
        timeout: TEST_CONFIG.testTimeout,
      });

      agentOutput = result || 'Agent completed without explicit output';
      console.log(`📤 Agent Output: ${agentOutput}`);
      this.logToFile(`${phaseName}.log`, `Agent Output: ${agentOutput}`);

      // Take final screenshot
      const finalScreenshot = await this.takeScreenshot(`${phaseName}_end.png`);
      screenshots.push(finalScreenshot);

      // Wait a moment for any final page changes
      await this.stagehand.page.waitForTimeout(2000);

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      status = 'error';
      console.error(`❌ Phase failed: ${error}`);
      this.logToFile(`${phaseName}.log`, `ERROR: ${error}`);
      
      // Take error screenshot
      const errorScreenshot = await this.takeScreenshot(`${phaseName}_error.png`);
      screenshots.push(errorScreenshot);
    }

    const duration = Date.now() - phaseStartTime;
    const result: TestResult = {
      phase: phaseName,
      status,
      duration,
      actions,
      screenshots,
      agentOutput,
      error,
    };

    this.testResults.push(result);
    console.log(`⏱️  Phase completed in ${duration}ms with status: ${status}`);
    
    return result;
  }

  async runTest(): Promise<void> {
    try {
      await this.initialize();

      // Phase 1: Initial Navigation & Exploration
      await this.executeAgentPhase(
        'navigation_exploration',
        'Go to https://itch.io/games and explore the main games page. Get familiar with the layout and understand what types of games are featured. Take note of the different categories and sections available.',
        'Agent successfully navigates to itch.io/games and explores the interface'
      );

      // Phase 2: Game Discovery & Evaluation
      await this.executeAgentPhase(
        'game_discovery',
        'Browse through the games displayed on the page and identify 3-5 indie games that show commercial potential. Look for games with good visuals, interesting concepts, active community engagement, and professional presentation. Click on games that catch your attention as potential investment opportunities.',
        'Agent identifies and visits promising games based on publisher criteria'
      );

      // Phase 3: Deep Investigation
      await this.executeAgentPhase(
        'deep_investigation',
        'Pick the most promising game you found and investigate it thoroughly. Check the game\'s page in detail: read the description, look at screenshots/videos, check the developer\'s profile, read user comments if available, and assess the overall quality and marketability. Navigate to the developer\'s profile to see their other work.',
        'Agent conducts detailed analysis of a selected game and developer'
      );

      // Phase 4: Investment Decision & Reasoning
      await this.executeAgentPhase(
        'investment_decision',
        'Based on your investigation, write a comprehensive investment recommendation. Explain whether you would invest in or publish this game, providing detailed reasoning about market potential, production quality, developer credibility, and risk assessment. Be specific about what makes this game a good or poor investment opportunity.',
        'Agent provides detailed investment analysis with clear reasoning'
      );

      // Phase 5: Competitive Analysis
      await this.executeAgentPhase(
        'competitive_analysis',
        'Look for similar games or competitors to your selected game. Browse other games in the same genre or category to understand the competitive landscape. Assess how your chosen game differentiates itself from others in the market.',
        'Agent analyzes competitive landscape and market positioning'
      );

    } catch (error) {
      console.error('❌ Test execution failed:', error);
      this.logToFile('test_error.log', `Test execution failed: ${error}`);
    } finally {
      await this.cleanup();
    }
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up and generating report...');
    
    try {
      // Generate final report
      await this.generateReport();
      
      // Close Stagehand
      if (this.stagehand) {
        await this.stagehand.close();
      }
      
      console.log('✅ Test completed and resources cleaned up');
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  }

  private async generateReport(): Promise<void> {
    const totalDuration = Date.now() - this.startTime;
    const successfulPhases = this.testResults.filter(r => r.status === 'success').length;
    const failedPhases = this.testResults.filter(r => r.status === 'error').length;

    const report = {
      testSummary: {
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date().toISOString(),
        totalDuration: `${totalDuration}ms`,
        totalPhases: this.testResults.length,
        successfulPhases,
        failedPhases,
        successRate: `${((successfulPhases / this.testResults.length) * 100).toFixed(1)}%`,
      },
      testConfiguration: TEST_CONFIG,
      phaseResults: this.testResults.map(result => ({
        phase: result.phase,
        status: result.status,
        duration: `${result.duration}ms`,
        actionCount: result.actions.length,
        screenshotCount: result.screenshots.length,
        agentOutputLength: result.agentOutput.length,
        error: result.error,
      })),
      detailedResults: this.testResults,
      analysis: {
        agentPerformance: this.analyzeAgentPerformance(),
        recommendations: this.generateRecommendations(),
      },
    };

    const reportPath = path.join(TEST_CONFIG.reportsPath, `test_report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Also create a human-readable summary
    const summaryPath = path.join(TEST_CONFIG.reportsPath, `test_summary_${Date.now()}.md`);
    const summary = this.generateMarkdownSummary(report);
    fs.writeFileSync(summaryPath, summary);

    console.log(`📊 Report generated: ${reportPath}`);
    console.log(`📝 Summary generated: ${summaryPath}`);
  }

  private analyzeAgentPerformance(): string[] {
    const analysis: string[] = [];
    
    if (this.testResults.length === 0) {
      analysis.push('No test results to analyze');
      return analysis;
    }

    const avgDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0) / this.testResults.length;
    analysis.push(`Average phase duration: ${avgDuration.toFixed(0)}ms`);

    const totalActions = this.testResults.reduce((sum, r) => sum + r.actions.length, 0);
    analysis.push(`Total agent actions performed: ${totalActions}`);

    const phasesWithOutput = this.testResults.filter(r => r.agentOutput.length > 0).length;
    analysis.push(`Phases with meaningful output: ${phasesWithOutput}/${this.testResults.length}`);

    if (failedPhases > 0) {
      analysis.push(`${failedPhases} phases failed - review error logs for improvement opportunities`);
    }

    return analysis;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    const errorPhases = this.testResults.filter(r => r.status === 'error');
    if (errorPhases.length > 0) {
      recommendations.push('Review failed phases and adjust instructions for better clarity');
    }

    const shortOutputPhases = this.testResults.filter(r => r.agentOutput.length < 50);
    if (shortOutputPhases.length > 0) {
      recommendations.push('Some phases produced minimal output - consider more specific instructions');
    }

    recommendations.push('Compare agent decision quality against manual evaluation');
    recommendations.push('Test with different AI providers to compare performance');
    recommendations.push('Implement automated validation of agent discoveries');

    return recommendations;
  }

  private generateMarkdownSummary(report: any): string {
    return `# Stagehand itch.io Publisher Agent Test Report

## Test Summary
- **Start Time**: ${report.testSummary.startTime}
- **Duration**: ${report.testSummary.totalDuration}
- **Success Rate**: ${report.testSummary.successRate}
- **Phases**: ${report.testSummary.successfulPhases} successful, ${report.testSummary.failedPhases} failed

## Phase Results
${report.phaseResults.map((phase: any) => `
### ${phase.phase}
- **Status**: ${phase.status}
- **Duration**: ${phase.duration}
- **Actions**: ${phase.actionCount}
- **Screenshots**: ${phase.screenshotCount}
${phase.error ? `- **Error**: ${phase.error}` : ''}
`).join('')}

## Agent Performance Analysis
${report.analysis.agentPerformance.map((item: string) => `- ${item}`).join('\n')}

## Recommendations
${report.analysis.recommendations.map((item: string) => `- ${item}`).join('\n')}

## Next Steps
1. Review detailed logs in the logs directory
2. Examine screenshots to understand agent behavior
3. Compare results with existing Firecrawl-based scraping
4. Optimize agent instructions based on performance
`;
  }
}

// Main execution
async function main() {
  console.log('🎮 Starting Stagehand itch.io Publisher Agent Test');
  console.log('=' .repeat(60));

  const test = new StagehandItchioTest();
  await test.runTest();

  console.log('\n🎯 Test execution completed');
  console.log('📁 Check the test/results directory for detailed outputs');
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { StagehandItchioTest };