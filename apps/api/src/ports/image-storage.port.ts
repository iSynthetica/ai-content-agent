// ImageStoragePort — сховище картинок (spike-2 §2.3, §4.3). МВП: worker пише файли,
// api віддає публічний URL / читає байти для експорту. Адаптер МВП — локальний том;
// S3/MinIO — шов (getUploadUrl?). Тримаємо порт, щоб сервіси не залежали від конкретики.

export interface ImageStoragePort {
  getPublicUrl(key: string): string;
  read(key: string): Promise<Buffer>;
  // шов під S3/MinIO — presigned upload:
  getUploadUrl?(key: string, contentType: string): Promise<string>;
}
