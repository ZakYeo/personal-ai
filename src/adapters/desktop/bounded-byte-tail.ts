export class BoundedByteTail {
  private readonly bytes: Buffer;
  private length = 0;
  private start = 0;
  private wasTruncated = false;

  constructor(private readonly maximumBytes: number) {
    this.bytes = Buffer.allocUnsafe(maximumBytes);
  }

  append(chunk: Buffer): void {
    if (chunk.length === 0) return;

    if (chunk.length >= this.maximumBytes) {
      chunk.copy(this.bytes, 0, chunk.length - this.maximumBytes, chunk.length);
      this.wasTruncated ||= this.length > 0 || chunk.length > this.maximumBytes;
      this.length = this.maximumBytes;
      this.start = 0;
      return;
    }

    const discarded = Math.max(
      0,
      this.length + chunk.length - this.maximumBytes,
    );
    if (discarded > 0) {
      this.start = (this.start + discarded) % this.maximumBytes;
      this.length -= discarded;
      this.wasTruncated = true;
    }

    const end = (this.start + this.length) % this.maximumBytes;
    const firstLength = Math.min(chunk.length, this.maximumBytes - end);
    chunk.copy(this.bytes, end, 0, firstLength);
    if (firstLength < chunk.length) {
      chunk.copy(this.bytes, 0, firstLength);
    }
    this.length += chunk.length;
  }

  output(): { text: string; truncated: boolean } {
    const output = Buffer.allocUnsafe(this.length);
    const firstLength = Math.min(this.length, this.maximumBytes - this.start);
    this.bytes.copy(output, 0, this.start, this.start + firstLength);
    if (firstLength < this.length) {
      this.bytes.copy(output, firstLength, 0, this.length - firstLength);
    }

    return { text: output.toString("utf8"), truncated: this.wasTruncated };
  }
}
