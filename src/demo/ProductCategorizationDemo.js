// Demo: Product Categorization Pipeline
// Classify products into the right category from thousands of options

import { getXRay } from '../xray-sdk/index';

class ProductCategorizationDemo {
  constructor() {
    this.xray = getXRay();
  }

  /**
   * Simulate the full product categorization pipeline
   */
  async categorizeProduct(product) {
    this.xray.startRun({
      pipeline: 'product-categorization',
      input: product,
      metadata: {
        productId: product.id,
        sellerId: product.sellerId,
      },
    });

    try {
      // Step 1: Extract product attributes
      const attributes = await this.extractAttributes(product);

      // Step 2: Match against category requirements
      const categoryMatches = await this.matchCategories(attributes);

      // Step 3: Filter by confidence threshold
      const highConfidence = await this.filterByConfidence(categoryMatches);

      // Step 4: Handle ambiguous cases
      const resolved = await this.resolveAmbiguity(highConfidence, product);

      // Step 5: Select best-fit category
      const bestCategory = await this.selectBestCategory(resolved);

      this.xray.endRun({
        status: 'success',
        output: bestCategory,
      });

      return bestCategory;
    } catch (error) {
      this.xray.endRun({
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 1: Extract product attributes
   */
  async extractAttributes(product) {
    const startTime = Date.now();
    await this.delay(180);

    const attributes = {
      keywords: product.title.toLowerCase().split(' ').slice(0, 10),
      brand: product.brand,
      category: product.category,
      price: product.price,
      features: product.attributes || [],
      description: product.description ? product.description.substring(0, 200) : '',
    };

    const output = {
      attributes,
      keywordCount: attributes.keywords.length,
      featureCount: attributes.features.length,
    };

    this.xray.recordStep({
      name: 'attribute-extraction',
      type: 'transform',
      input: { product: { id: product.id, title: product.title } },
      output,
      reasoning: `Extracted ${attributes.keywords.length} keywords and ${attributes.features.length} features from product`,
      duration: Date.now() - startTime,
    });

    return attributes;
  }

  /**
   * Step 2: Match against category requirements
   */
  async matchCategories(attributes) {
    const startTime = Date.now();
    await this.delay(300);

    // Simulate matching against 10,000+ categories
    const allCategories = [
      { id: 'cat_electronics_phones', name: 'Electronics > Phones', keywords: ['phone', 'mobile', 'smartphone'], confidence: 0.0 },
      { id: 'cat_electronics_accessories', name: 'Electronics > Accessories', keywords: ['charger', 'cable', 'adapter'], confidence: 0.0 },
      { id: 'cat_electronics_computers', name: 'Electronics > Computers', keywords: ['laptop', 'computer', 'pc'], confidence: 0.0 },
      { id: 'cat_home_office', name: 'Home > Office Supplies', keywords: ['desk', 'stand', 'organizer'], confidence: 0.0 },
      { id: 'cat_electronics_audio', name: 'Electronics > Audio', keywords: ['speaker', 'headphone', 'audio'], confidence: 0.0 },
    ];

    // Generate more categories
    const categories = [];
    for (let i = 0; i < 50; i++) {
      const category = {
        id: `cat_${i}`,
        name: `Category ${i}`,
        keywords: [`keyword${i}`, `term${i}`],
        confidence: Math.random() * 0.5 + 0.3,
      };
      categories.push(category);
    }

    // Score matches
    const matches = categories.map(cat => {
      const keywordMatches = attributes.keywords.filter(kw =>
        cat.keywords.some(ck => ck.includes(kw) || kw.includes(ck))
      ).length;
      const confidence = Math.min(0.95, (keywordMatches / attributes.keywords.length) * 0.8 + Math.random() * 0.2);
      return { ...cat, confidence };
    });

    const output = { matches: matches.length, topMatches: matches.slice(0, 5) };

    this.xray.recordStep({
      name: 'category-matching',
      type: 'search',
      input: { attributes: { keywordCount: attributes.keywords.length } },
      output,
      candidates: matches.slice(0, 30),
      candidateLimit: 30,
      reasoning: `Matched product against ${matches.length} potential categories based on keywords and attributes`,
      duration: Date.now() - startTime,
    });

    return matches;
  }

  /**
   * Step 3: Filter by confidence threshold
   */
  async filterByConfidence(matches) {
    const startTime = Date.now();
    await this.delay(120);

    const threshold = 0.65;
    const highConfidence = matches.filter(m => m.confidence >= threshold);
    const lowConfidence = matches.filter(m => m.confidence < threshold);

    const output = {
      highConfidence: highConfidence.length,
      lowConfidence: lowConfidence.length,
      threshold,
    };

    this.xray.recordStep({
      name: 'confidence-filtering',
      type: 'filter',
      input: { matchCount: matches.length, threshold },
      output,
      candidates: highConfidence,
      filtered: lowConfidence.slice(0, 20).map(m => ({
        candidate: m,
        reasons: ['low_confidence_score'],
      })),
      filteredLimit: 20,
      reasoning: `Filtered ${matches.length} matches to ${highConfidence.length} high-confidence categories (>=${threshold})`,
      duration: Date.now() - startTime,
    });

    return highConfidence;
  }

  /**
   * Step 4: Resolve ambiguous cases
   */
  async resolveAmbiguity(matches, product) {
    const startTime = Date.now();
    await this.delay(250);

    // Simulate LLM-based disambiguation
    const resolved = matches.map(match => ({
      ...match,
      disambiguationScore: Math.random() * 0.2 + 0.7,
      reasoning: `Category ${match.name} matches based on ${Math.floor(match.confidence * 10)}/10 confidence`,
    }));

    // Filter ambiguous ones
    const clear = resolved.filter(m => m.disambiguationScore > 0.75);
    const ambiguous = resolved.filter(m => m.disambiguationScore <= 0.75);

    const output = { clear: clear.length, ambiguous: ambiguous.length };

    this.xray.recordStep({
      name: 'ambiguity-resolution',
      type: 'llm',
      input: { matchCount: matches.length },
      output,
      candidates: clear,
      filtered: ambiguous.slice(0, 10).map(m => ({
        candidate: m,
        reasons: ['ambiguous_match'],
      })),
      reasoning: `Resolved ${matches.length} matches, ${clear.length} are clear, ${ambiguous.length} are ambiguous`,
      duration: Date.now() - startTime,
    });

    return clear;
  }

  /**
   * Step 5: Select best-fit category
   */
  async selectBestCategory(matches) {
    const startTime = Date.now();
    await this.delay(100);

    // Handle case where no matches are provided
    if (!matches || matches.length === 0) {
      const output = { selected: null, rank: 0, error: 'No matches to select from' };
      
      this.xray.recordStep({
        name: 'category-selection',
        type: 'rank',
        input: { matchCount: 0 },
        output,
        candidates: [],
        reasoning: 'No category matches available for selection',
        duration: Date.now() - startTime,
      });

      throw new Error('No category matches available for selection');
    }

    // Rank by combined confidence and disambiguation score
    const ranked = matches
      .map(m => ({
        ...m,
        finalScore: m.confidence * 0.7 + m.disambiguationScore * 0.3,
      }))
      .sort((a, b) => b.finalScore - a.finalScore);

    const best = ranked[0];

    const output = { selected: best, rank: 1, finalScore: best.finalScore };

    this.xray.recordStep({
      name: 'category-selection',
      type: 'rank',
      input: { matchCount: matches.length },
      output,
      candidates: ranked.slice(0, 5),
      reasoning: `Selected best-fit category: ${best.name} with final score ${best.finalScore.toFixed(2)}`,
      duration: Date.now() - startTime,
    });

    return best;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ProductCategorizationDemo;

