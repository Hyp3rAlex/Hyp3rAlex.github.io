/**
 * Capabilities are only listed when a project evidences them.
 * `evidence` holds project ids (content collection slugs); unknown ids are skipped at render time.
 */
export interface Capability {
  code: string;
  title: string;
  items: { text: string; evidence: string[] }[];
}

export const capabilities: Capability[] = [
  {
    code: 'A',
    title: 'Backend & software',
    items: [
      { text: 'Layered REST services in Java / Spring Boot with JPA and PostgreSQL', evidence: ['demographics-service'] },
      { text: 'Python application code and tooling inside team codebases', evidence: ['bmw-ride-planner', 'tacto-negotiation-arena'] },
      { text: 'Hard-constraint guards around rule-based decision logic', evidence: ['tacto-negotiation-arena'] },
      { text: 'Containerised local environments with Docker Compose', evidence: ['demographics-service'] },
    ],
  },
  {
    code: 'B',
    title: 'Data & automation',
    items: [
      { text: 'Paged ingestion and aggregation from external REST APIs', evidence: ['demographics-service'] },
      { text: 'Validation pipelines and data-quality rules in Python', evidence: ['infraflow-mission-control', 'longisafe-lab'] },
      { text: 'Generated reporting: Markdown, Excel workbooks, slide decks and Confluence page sources from one pipeline', evidence: ['infraflow-mission-control'] },
      { text: 'Caching and precomputation for slow data paths', evidence: ['bmw-ride-planner'] },
    ],
  },
  {
    code: 'C',
    title: 'Physical & industrial systems',
    items: [
      { text: 'Vehicle longitudinal-dynamics modelling and signal plausibility monitors', evidence: ['longisafe-lab'] },
      { text: 'Excel / VBA engineering tools cross-checked against a Python reference', evidence: ['longisafe-lab'] },
      { text: 'Spatial indexing and search-loop optimisation for a road-network router', evidence: ['bmw-ride-planner'] },
      { text: 'Shop-floor exposure: dimensional inspection, CMM workflows, laser welding', evidence: [] },
    ],
  },
  {
    code: 'D',
    title: 'Quality & testing',
    items: [
      { text: 'Unit tests with pytest / unittest and JUnit 5 + Mockito', evidence: ['longisafe-lab', 'demographics-service', 'bmw-ride-planner'] },
      { text: 'Independent implementations compared against each other', evidence: ['longisafe-lab'] },
      { text: 'Stating limitations and what was not verified', evidence: ['longisafe-lab', 'demographics-service'] },
      { text: 'CI on GitHub Actions', evidence: ['longisafe-lab', 'portfolio'] },
    ],
  },
];
