import { getXRay } from '../xray-sdk/index';

class CompetitorSelectionDemo {
  constructor() {
    this.xray = getXRay();
  }

  async findCompetitor(sellerProduct) {
    this.xray.startRun({
      pipeline: 'competitor-selection',
      input: sellerProduct,
      metadata: {
        sellerId: sellerProduct.sellerId,
        productId: sellerProduct.id,
      },
    });

    try {
      const keywords = await this.generateKeywords(sellerProduct);

      const candidates = await this.searchCandidates(keywords);

      const filtered = await this.applyFilters(candidates, sellerProduct);

      const evaluated = await this.evaluateRelevance(filtered, sellerProduct);

      const bestMatch = await this.rankAndSelect(evaluated, sellerProduct);

      this.xray.endRun({
        status: 'success',
        output: bestMatch,
      });

      return bestMatch;
    } catch (error) {
      this.xray.endRun({
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  async generateKeywords(product) {
    const startTime = Date.now();

    await this.delay(200);

    const keywords = [
      `${product.title} ${product.category}`,
      product.brand,
      ...product.attributes.slice(0, 3),
    ];

    const output = { keywords, count: keywords.length };

    this.xray.recordStep({
      name: 'keyword-generation',
      type: 'llm',
      input: { product: { id: product.id, title: product.title, category: product.category } },
      output,
      reasoning: `Generated ${keywords.length} keywords from product title, category, brand, and attributes`,
      duration: Date.now() - startTime,
    });

    return keywords;
  }

  async searchCandidates(keywords) {
    const startTime = Date.now();

    await this.delay(300);

    const candidates = [];
    for (let i = 0; i < 5000; i++) {
      candidates.push({
        id: `prod_${i}`,
        title: `Product ${i}`,
        price: Math.random() * 100 + 10,
        rating: Math.random() * 2 + 3,
        reviewCount: Math.floor(Math.random() * 10000),
        category: ['Electronics', 'Accessories', 'Home'][Math.floor(Math.random() * 3)],
        relevanceScore: Math.random(),
      });
    }

    const output = { candidates: candidates.length, sample: candidates.slice(0, 5) };

    this.xray.recordStep({
      name: 'candidate-search',
      type: 'search',
      input: { keywords },
      output,
      candidates: candidates.slice(0, 100),
      candidateLimit: 100,
      reasoning: `Searched catalog and found ${candidates.length} candidate products`,
      duration: Date.now() - startTime,
    });

    return candidates;
  }

  async applyFilters(candidates, sellerProduct) {
    const startTime = Date.now();

    await this.delay(150);

    const filtered = [];
    const passed = [];

    candidates.forEach(candidate => {
      const reasons = [];

      if (candidate.price < sellerProduct.price * 0.5 || candidate.price > sellerProduct.price * 2) {
        reasons.push('price_out_of_range');
      }

      if (candidate.rating < 3.5) {
        reasons.push('low_rating');
      }

      if (candidate.reviewCount < 10) {
        reasons.push('insufficient_reviews');
      }

      if (candidate.category !== sellerProduct.category) {
        reasons.push('category_mismatch');
      }

      if (reasons.length > 0) {
        filtered.push({ candidate, reasons });
      } else {
        passed.push(candidate);
      }
    });

    const output = { passed: passed.length, filtered: filtered.length };

    this.xray.recordStep({
      name: 'filtering',
      type: 'filter',
      input: {
        candidateCount: candidates.length,
        filters: {
          priceRange: [sellerProduct.price * 0.5, sellerProduct.price * 2],
          minRating: 3.5,
          minReviews: 10,
          categoryMatch: true,
        },
      },
      output,
      candidates: passed.slice(0, 50),
      filtered: filtered.slice(0, 50),
      filteredLimit: 50,
      reasoning: `Applied filters: ${passed.length} passed, ${filtered.length} filtered out`,
      duration: Date.now() - startTime,
    });

    return passed;
  }

  async evaluateRelevance(candidates, sellerProduct) {
    const startTime = Date.now();

    await this.delay(400);

    const evaluated = candidates.map(candidate => ({
      ...candidate,
      relevanceScore: Math.random() * 0.3 + 0.7,
      reasoning: `Product matches on ${Math.floor(Math.random() * 3) + 2} key attributes`,
    }));

    const highRelevance = evaluated.filter(c => c.relevanceScore > 0.75);
    const lowRelevance = evaluated.filter(c => c.relevanceScore <= 0.75);

    const output = { highRelevance: highRelevance.length, lowRelevance: lowRelevance.length };

    this.xray.recordStep({
      name: 'relevance-evaluation',
      type: 'llm',
      input: { candidateCount: candidates.length },
      output,
      candidates: highRelevance,
      filtered: lowRelevance.map(c => ({
        candidate: c,
        reasons: ['low_relevance_score'],
      })),
      reasoning: `Evaluated ${candidates.length} candidates, ${highRelevance.length} passed relevance threshold`,
      duration: Date.now() - startTime,
    });

    return highRelevance;
  }

  async rankAndSelect(candidates, sellerProduct) {
    const startTime = Date.now();

    await this.delay(100);

    const ranked = candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const bestMatch = ranked[0];

    const output = { selected: bestMatch, rank: 1 };

    this.xray.recordStep({
      name: 'ranking-selection',
      type: 'rank',
      input: { candidateCount: candidates.length },
      output,
      candidates: ranked.slice(0, 10),
      reasoning: `Ranked ${candidates.length} candidates by relevance score, selected top match`,
      duration: Date.now() - startTime,
    });

    return bestMatch;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CompetitorSelectionDemo;

