export type OverviewDebugMappingRow = {
  ui: string;
  jsonPath: string;
  value: string | number | boolean | null;
  source: string;
};

export type OverviewDebug = {
  generatedAt: string;
  howToRead: string;
  mapping: OverviewDebugMappingRow[];
};
