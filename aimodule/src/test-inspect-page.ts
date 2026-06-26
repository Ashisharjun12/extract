import dotenv from 'dotenv';
import path from 'path';
import { AIService } from './infrastructure/ai/ai.service.js';
import { buildSliceInput } from './modules/document/utils/workshop/workshop-pdf-slice.util.js';
import { getWorkshopChunkArrayPrompt } from './modules/document/prompts/workshop-bill.prompt.js';
import { WorkshopChunkArraySchema } from './modules/document/schema/workshop/workshop-bill.gemini.schema.js';
import { expandWorkshopArrayRows } from './modules/document/schema/workshop/workshop-bill.shared.js';

dotenv.config();

async function run() {
  const aiService = AIService.getInstance();
  const pdfPath = path.resolve('test-workshop.pdf');
  const inputData = {
    localPdfPath: pdfPath,
    fileData: { fileUri: '', mimeType: 'application/pdf' },
    pageCount: 5,
  };

  const model = process.env.WORKSHOP_AI_MODEL || 'gemini-3.1-flash-lite';
  console.log(`Using model: ${model}`);

  // Check page 5 (rows 34-50) - has prices on the actual page
  for (const pageNum of [5, 4, 3]) {
    console.log(`\n========== RAW LEAN ARRAY OUTPUT — PAGE ${pageNum} ==========`);
    const slice = await buildSliceInput(inputData, [pageNum], `lean-raw-page-${pageNum}`);
    try {
      const raw = await aiService.processDocument(
        slice.input,
        getWorkshopChunkArrayPrompt(),
        WorkshopChunkArraySchema,
        8192,
        model,
      ) as Record<string, unknown>;

      const parts = Array.isArray(raw.partsTable) ? raw.partsTable as unknown[][] : [];
      console.log(`Raw partsTable rows: ${parts.length}`);
      if (parts.length > 0) {
        console.log('First row (raw array):', JSON.stringify(parts[0]));
        console.log('Last  row (raw array):', JSON.stringify(parts[parts.length - 1]));
        console.log('Positions: [0:SrNo, 1:PartNo, 2:HSN, 3:Desc, 4:UOM, 5:Qty, 6:UnitPrice, 7:Disc, 8:TaxableAmt, 9:TaxAmt, 10:TotalPrice]');
      }

      const expanded = expandWorkshopArrayRows(raw);
      const expParts = Array.isArray(expanded.partsTable) ? expanded.partsTable as Record<string, unknown>[] : [];
      console.log('After expansion — first row totalPrice:', expParts[0]?.totalPrice);
      console.log('After expansion — last  row totalPrice:', expParts[expParts.length - 1]?.totalPrice);
    } finally {
      await slice.dispose();
    }
  }
}

run().catch(console.error);
