// Demo: Listing Optimization Pipeline
// Generate better product listings by learning from top competitors

import { getXRay } from '../xray-sdk/index';

class ListingOptimizationDemo {
  constructor() {
    this.xray = getXRay();
  }

  /**
   * Simulate the full listing optimization pipeline
   */
  async optimizeListing(currentListing) {
    this.xray.startRun({
      pipeline: 'listing-optimization',
      input: currentListing,
      metadata: {
        productId: currentListing.productId,
        sellerId: currentListing.sellerId,
      },
    });

    try {
      // Step 1: Analyze current listing
      await this.analyzeListing(currentListing);

      // Step 2: Find top competitors
      const competitors = await this.findTopCompetitors(currentListing);

      // Step 3: Extract high-performing patterns
      const patterns = await this.extractPatterns(competitors);

      // Step 4: Generate content variations
      const variations = await this.generateVariations(currentListing, patterns);

      // Step 5: Score and select best version
      const optimized = await this.scoreAndSelect(variations, currentListing);

      this.xray.endRun({
        status: 'success',
        output: optimized,
      });

      return optimized;
    } catch (error) {
      this.xray.endRun({
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 1: Analyze current listing
   */
  async analyzeListing(listing) {
    const startTime = Date.now();
    await this.delay(150);

    const analysis = {
      titleLength: listing.title.length,
      bulletCount: listing.bullets.length,
      descriptionLength: listing.description.length,
      imageCount: listing.images.length,
      keywordDensity: Math.random() * 0.3 + 0.1,
      readabilityScore: Math.random() * 0.2 + 0.7,
    };

    const output = { analysis, issues: ['short_description', 'low_keyword_density'] };

    this.xray.recordStep({
      name: 'listing-analysis',
      type: 'transform',
      input: { listing: { productId: listing.productId, title: listing.title } },
      output,
      reasoning: `Analyzed listing structure and identified ${output.issues.length} improvement areas`,
      duration: Date.now() - startTime,
    });

    return analysis;
  }

  /**
   * Step 2: Find top competitors
   */
  async findTopCompetitors(listing) {
    const startTime = Date.now();
    await this.delay(250);

    const competitors = [];
    for (let i = 0; i < 200; i++) {
      competitors.push({
        id: `comp_${i}`,
        title: `Competitor Product ${i}`,
        salesRank: Math.floor(Math.random() * 10000) + 1,
        rating: Math.random() * 1.5 + 3.5,
        reviewCount: Math.floor(Math.random() * 50000),
        titleLength: Math.floor(Math.random() * 100) + 50,
        bulletCount: Math.floor(Math.random() * 5) + 3,
      });
    }

    const output = { competitors: competitors.length, sample: competitors.slice(0, 5) };

    this.xray.recordStep({
      name: 'competitor-search',
      type: 'search',
      input: { category: listing.category, keywords: listing.keywords },
      output,
      candidates: competitors.slice(0, 50),
      candidateLimit: 50,
      reasoning: `Found ${competitors.length} competitor listings in the same category`,
      duration: Date.now() - startTime,
    });

    return competitors;
  }

  /**
   * Step 3: Extract high-performing patterns
   */
  async extractPatterns(competitors) {
    const startTime = Date.now();
    await this.delay(200);

    // Filter to top performers
    const topPerformers = competitors
      .filter(c => c.salesRank < 1000 && c.rating > 4.0)
      .slice(0, 30);

    const filtered = competitors.filter(c => !topPerformers.includes(c));

    const patterns = {
      avgTitleLength: Math.floor(
        topPerformers.reduce((sum, c) => sum + c.titleLength, 0) / topPerformers.length
      ),
      avgBulletCount: Math.floor(
        topPerformers.reduce((sum, c) => sum + c.bulletCount, 0) / topPerformers.length
      ),
      commonKeywords: ['premium', 'durable', 'high-quality', 'fast', 'reliable'],
    };

    const output = { patterns, topPerformersCount: topPerformers.length };

    this.xray.recordStep({
      name: 'pattern-extraction',
      type: 'filter',
      input: { competitorCount: competitors.length },
      output,
      candidates: topPerformers,
      filtered: filtered.slice(0, 30).map(c => ({
        candidate: c,
        reasons: c.salesRank >= 1000 ? ['low_sales_rank'] : ['low_rating'],
      })),
      filteredLimit: 30,
      reasoning: `Extracted patterns from ${topPerformers.length} top-performing competitors`,
      duration: Date.now() - startTime,
    });

    return patterns;
  }

  /**
   * Step 4: Generate content variations
   */
  async generateVariations(listing, patterns) {
    const startTime = Date.now();
    await this.delay(350);

    const variations = [];
    for (let i = 0; i < 150; i++) {
      variations.push({
        id: `var_${i}`,
        title: `${listing.title} - ${patterns.commonKeywords[i % patterns.commonKeywords.length]}`,
        bullets: Array(patterns.avgBulletCount).fill(`Feature ${i}`),
        description: `Enhanced description variation ${i}`,
        qualityScore: Math.random() * 0.4 + 0.6,
        keywordScore: Math.random() * 0.3 + 0.7,
      });
    }

    const output = { variations: variations.length, sample: variations.slice(0, 3) };

    this.xray.recordStep({
      name: 'content-generation',
      type: 'llm',
      input: { patterns, originalListing: listing.title },
      output,
      candidates: variations.slice(0, 50),
      candidateLimit: 50,
      reasoning: `Generated ${variations.length} content variations based on top performer patterns`,
      duration: Date.now() - startTime,
    });

    return variations;
  }

  /**
   * Step 5: Score and select best version
   */
  async scoreAndSelect(variations, originalListing) {
    const startTime = Date.now();
    await this.delay(150);

    // Filter by quality threshold
    const highQuality = variations.filter(v => v.qualityScore > 0.75);
    const lowQuality = variations.filter(v => v.qualityScore <= 0.75);

    // Rank by combined score
    const ranked = highQuality
      .map(v => ({
        ...v,
        combinedScore: v.qualityScore * 0.6 + v.keywordScore * 0.4,
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore);

    const best = ranked[0];

    const output = { selected: best, rank: 1, combinedScore: best.combinedScore };

    this.xray.recordStep({
      name: 'scoring-selection',
      type: 'rank',
      input: { variationCount: variations.length },
      output,
      candidates: ranked.slice(0, 10),
      filtered: lowQuality.slice(0, 20).map(v => ({
        candidate: v,
        reasons: ['low_quality_score'],
      })),
      reasoning: `Scored ${variations.length} variations, selected top performer with score ${best.combinedScore.toFixed(2)}`,
      duration: Date.now() - startTime,
    });

    return best;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ListingOptimizationDemo;

