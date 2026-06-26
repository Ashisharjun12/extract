import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { WorkshopBillExtractor } from './modules/document/extractor/workshop-bill.extractor.js';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  console.log('Compiling test PDF from PNGs...');
  const brainDir = 'C:\\Users\\ashis\\.gemini\\antigravity\\brain\\6bbd71cd-da32-45e2-9084-80619fcd8cda';
  const pngFiles = [
    'media__1782460944168.png',
    'media__1782460944268.png',
    'media__1782460944340.png',
    'media__1782460944445.png',
    'media__1782460944503.png',
  ];

  const pdfDoc = await PDFDocument.create();

  for (const file of pngFiles) {
    const filePath = path.join(brainDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    console.log(`Embedding ${file}...`);
    const pngBytes = await fs.promises.readFile(filePath);
    const pngImage = await pdfDoc.embedPng(pngBytes);
    
    const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfPath = path.resolve('test-workshop.pdf');
  await fs.promises.writeFile(pdfPath, pdfBytes);
  console.log(`Test PDF created at: ${pdfPath}`);

  const extractor = new WorkshopBillExtractor();
  
  const inputData = {
    localPdfPath: pdfPath,
    fileData: {
      fileUri: '',
      mimeType: 'application/pdf',
    },
    pageCount: pngFiles.length,
  };

  console.log('Starting extraction...');
  try {
    const result = await extractor.extract(inputData);
    console.log('\n================ EXTRACTION SUCCESS ================');
    console.log('Parts count:', result.partsTable?.length ?? 0);
    console.log('Labour count:', result.labourTable?.length ?? 0);
    console.log('Requires Human Review:', result.requiresHumanReview);
    console.log('Extraction Mode:', result.extractionMode);
    
    console.log('\n--- ALL PARTS ROWS ---');
    console.table(
      (result.partsTable ?? []).map((r: any) => ({
        srNo: r.srNo,
        partNumber: r.partNumber,
        hsnSac: r.hsnSac,
        description: r.description,
        totalPrice: r.totalPrice,
      }))
    );

    console.log('\n--- ALL LABOUR ROWS ---');
    console.table(
      (result.labourTable ?? []).map((r: any) => ({
        srNo: r.srNo,
        labourCode: r.labourCode,
        hsnSac: r.hsnSac,
        description: r.description,
        totalAmount: r.totalAmount,
      }))
    );

    const totalPartsPrice = result.partsTable?.reduce((acc: number, row: any) => acc + (Number(row.totalPrice) || 0), 0) ?? 0;
    const totalLabourPrice = result.labourTable?.reduce((acc: number, row: any) => acc + (Number(row.totalAmount) || 0), 0) ?? 0;
    console.log('\nCalculated Totals:');
    console.log('Parts Total price sum: ₹', totalPartsPrice.toFixed(2));
    console.log('Labour Total amount sum: ₹', totalLabourPrice.toFixed(2));
    console.log('Combined parts + labour rows count:', (result.partsTable?.length ?? 0) + (result.labourTable?.length ?? 0));
  } catch (error) {
    console.error('Extraction failed:', error);
  }
}

run();
