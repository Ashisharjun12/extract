import sharp from 'sharp';

export function getOptimizeImageStream() {
  return sharp()
    .rotate()
    .resize(1500, 1500, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 });
}
