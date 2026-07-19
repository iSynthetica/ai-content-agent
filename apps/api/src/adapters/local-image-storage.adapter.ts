import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageStoragePort } from "../ports/image-storage.port";

// Локальний том (МВП, §2.3). worker пише файли у IMAGE_STORAGE_DIR; api будує публічний URL
// і читає байти для експорту. S3/MinIO — шов (окремий адаптер, той самий інтерфейс).
export class LocalImageStorageAdapter implements ImageStoragePort {
  constructor(
    private readonly dir: string,
    private readonly publicBaseUrl: string,
  ) {}

  getPublicUrl(key: string): string {
    const base = this.publicBaseUrl.replace(/\/$/, "");
    return `${base}/media/${key}`;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(join(this.dir, key));
  }
}
