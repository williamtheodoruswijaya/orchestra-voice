import { getLevenshteinDistance } from "../../shared/utils/string-similarities";

import forbiddenData from "../../infrastructure/persistence/forbidden-content.json"; 

export class ContentValidator {
  public static isForbidden(input: string): { forbidden: boolean; reason?: string } {
    const normalizedInput = input.toLowerCase().trim();
    const words = normalizedInput.split(/\s+/);

    // 1. Cek Judul Secara Utuh menggunakan data dari JSON
    for (const title of forbiddenData.blacklistedTitles) {
      if (getLevenshteinDistance(normalizedInput, title.toLowerCase()) <= 1) {
        return { forbidden: true, reason: `"${title}" is inappropriate` };
      }
    }

    // 2. Cek Per Kata menggunakan data dari JSON
    for (const word of words) {
      for (const forbidden of forbiddenData.forbiddenWords) {
        if (getLevenshteinDistance(word, forbidden.toLowerCase()) <= 1) {
          return { forbidden: true, reason: `"${forbidden}" is forbidden` };
        }
      }
    }

    return { forbidden: false };
  }
}