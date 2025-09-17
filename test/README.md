# Stagehand itch.io Publisher Agent Test

This test suite evaluates Stagehand's agent mode for game discovery on itch.io, simulating a publisher looking for investment opportunities.

## Setup

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Configure Environment**
   ```bash
   cp test/.env.test test/.env
   # Edit test/.env and add your OpenAI API key:
   # - OpenAI API key (from https://platform.openai.com)
   # Note: Runs locally using Playwright - no Browserbase needed!
   ```

3. **Run the Test**
   ```bash
   # From project root
   npx tsx test/run-test.ts
   
   # Or directly
   npx tsx test/stagehand-agent-test.ts
   ```

## Test Phases

The test consists of 5 distinct phases that evaluate different aspects of the agent's capabilities:

### 1. Navigation & Exploration
- **Objective**: Navigate to itch.io/games and explore the interface
- **Tests**: Basic navigation, page understanding, UI familiarization

### 2. Game Discovery
- **Objective**: Identify 3-5 promising indie games for investment
- **Tests**: Game evaluation criteria, visual assessment, initial screening

### 3. Deep Investigation  
- **Objective**: Thoroughly analyze the most promising game
- **Tests**: Detailed analysis, developer research, quality assessment

### 4. Investment Decision
- **Objective**: Provide detailed investment recommendation
- **Tests**: Business reasoning, risk assessment, market analysis

### 5. Competitive Analysis
- **Objective**: Analyze competitive landscape and positioning
- **Tests**: Market research, differentiation analysis, context understanding

## Configuration

### Test Settings (`TEST_CONFIG`)
- `headless`: Set to `false` to watch the browser, `true` for CI/CD
- `debugMode`: Enable DOM debugging features
- `testTimeout`: Maximum time per phase (5 minutes default)

### Environment Variables
- `OPENAI_API_KEY`: Required for agent functionality
- `STAGEHAND_HEADLESS`: Override headless mode (default: false for local testing)
- `STAGEHAND_LOG_LEVEL`: Logging verbosity (debug/info/warn/error)

**Note**: This configuration runs Stagehand in LOCAL mode using installed Playwright browsers, eliminating the need for Browserbase credentials.

## Output Structure

```
test/results/
├── screenshots/           # Screenshots of agent actions
│   ├── navigation_exploration_start.png
│   ├── navigation_exploration_end.png
│   └── ...
├── logs/                 # Detailed execution logs
│   ├── stagehand.log
│   ├── navigation_exploration.log
│   └── ...
└── reports/              # Test reports and analysis
    ├── test_report_[timestamp].json
    └── test_summary_[timestamp].md
```

## Evaluation Criteria

The test evaluates the agent's performance across multiple dimensions:

### Agent Autonomy
- How well does it navigate without explicit instructions?
- Can it make independent decisions based on the publisher persona?
- Does it maintain context across multiple phases?

### Decision Quality
- Are game selections reasonable for a publisher?
- Is the investment analysis thorough and logical?
- Does it demonstrate understanding of commercial viability?

### Information Gathering
- How comprehensive is the game investigation?
- Does it find relevant details (developer, community, quality)?
- Can it synthesize information from multiple sources?

### Context Understanding
- Does it maintain the publisher/investor role throughout?
- Are recommendations business-focused rather than personal preference?
- Does it consider market factors and competition?

## Comparison with Existing Tools

This test helps compare Stagehand's agent approach against the existing Firecrawl-based scraping:

### Stagehand Agent Advantages
- Natural language instructions
- Context-aware decision making
- Adaptive navigation (handles UI changes)
- Human-like exploration patterns

### Traditional Scraping Advantages  
- Faster execution
- More predictable results
- Lower API costs
- Structured data extraction

## Troubleshooting

### Common Issues

1. **API Key Errors**
   - Ensure OPENAI_API_KEY is set in test/.env
   - Verify API key has sufficient credits

2. **Timeout Errors**
   - Increase testTimeout in TEST_CONFIG
   - Check internet connection and itch.io availability

3. **Browser Issues**
   - Set headless: false to debug visually
   - Check Playwright installation: `npx playwright install`

4. **Permission Errors**
   - Ensure test/results directories are writable
   - Check file system permissions

### Debug Mode

Run with debug enabled to see detailed browser interactions:

```bash
# Enable debug logging
STAGEHAND_LOG_LEVEL=debug npx tsx test/stagehand-agent-test.ts

# Watch browser actions
# Set headless: false in TEST_CONFIG
```

## Expected Results

A successful test run should demonstrate:

- ✅ Successful navigation to itch.io
- ✅ Identification of multiple promising games  
- ✅ Detailed investigation of at least one game
- ✅ Business-focused investment recommendation
- ✅ Competitive landscape analysis
- ✅ Comprehensive logging and screenshots

The generated reports will provide insights into:
- Agent decision-making quality
- Time efficiency vs. thoroughness
- Areas for instruction optimization
- Comparison metrics for evaluation