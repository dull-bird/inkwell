export interface MergeableDocument {
  path: string;
}

export function buildMergePaths(documents: MergeableDocument[]): string[] {
  if (documents.length < 2) throw new Error('Merge requires at least two PDFs.');
  return documents.map((document) => document.path);
}
