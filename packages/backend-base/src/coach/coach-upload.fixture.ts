import type { UploadStorage } from "./coach-upload.service";

export class MemoryStorage implements UploadStorage {
  objects = new Map<string, Uint8Array>();
  sizes = new Map<string, number>();
  signed: string[] = [];

  async getGlobalObjectUploadUrl({ key }: { key: string }) {
    this.signed.push(key);
    return `https://store.example.test/${key}?put`;
  }
  async getGlobalObjectUrl({ key }: { key: string }) {
    return `https://store.example.test/${key}?get`;
  }
  async objectSize(key: string) {
    if (!this.objects.has(key)) return null;
    return this.sizes.get(key) ?? this.objects.get(key)?.byteLength ?? null;
  }
  async getGlobalObjectStream(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }
  async putGlobalObjectStream({
    key,
    body,
  }: {
    key: string;
    body: ReadableStream<Uint8Array>;
  }) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>)
      chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    this.objects.set(key, new Uint8Array(bytes));
    return bytes.byteLength;
  }
  async putGlobalObject({ key, body }: { key: string; body: Buffer }) {
    this.objects.set(key, new Uint8Array(body));
  }
  async getGlobalObjectText(key: string) {
    const bytes = this.objects.get(key);
    return bytes ? Buffer.from(bytes).toString("utf8") : null;
  }
  async deleteObject(key: string) {
    this.sizes.delete(key);
    return this.objects.delete(key);
  }
}
