import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_PROCESSING_DISCLOSURE, AI_PROCESSING_CONFIRM_LABEL } from './ai-processing-disclosure';

describe('AI processing consent disclosure', () => {
  it('identifies the recipient, shared inputs, purpose and explicit action', () => {
    for (const text of ['fal.ai (FAL)', 'photos, masks, reference images', 'editing instructions', 'explicitly allow', 'Privacy Policy']) {
      expect(AI_PROCESSING_DISCLOSURE).toContain(text);
    }
    expect(AI_PROCESSING_DISCLOSURE).toContain(AI_PROCESSING_CONFIRM_LABEL);
  });
  it('uses the same disclosure for single and batch submission, with a cancel action', () => {
    for (const file of ['app/studio/[service].tsx', 'app/batch.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('${AI_PROCESSING_DISCLOSURE}');
      expect(/AI_PROCESSING_CONFIRM_LABEL,\s*action:/.test(source)).toBe(true);
      expect(source).toContain('secondary: true');
    }
  });
});
