export type GhlConfig = {
  apiKey: string;
  locationId: string;
  baseUrl: string;
  /** Optional custom field id that stores lead source (Texoma: lzdwJx2UWkIZtVfCjSNr). */
  sourceCustomFieldId: string | null;
};
