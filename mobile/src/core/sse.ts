// Incremental Server-Sent Events parser (text/event-stream).
// React Native has no EventSource, so the transport feeds raw text here.

export type SseEvent = { event: string; data: string; id?: string };

export class SseParser {
  private buffer = '';
  private event = 'message';
  private data: string[] = [];
  private id: string | undefined;
  retryMs: number | null = null;

  /** Feed newly received text; returns the events completed by it. */
  feed(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buffer.slice(0, idx);
      const nl = this.buffer.startsWith('\r\n', idx) ? 2 : 1;
      this.buffer = this.buffer.slice(idx + nl);
      if (line === '') {
        if (this.data.length) out.push({ event: this.event, data: this.data.join('\n'), id: this.id });
        this.event = 'message';
        this.data = [];
        continue;
      }
      if (line.startsWith(':')) continue; // comment / keep-alive ping
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') this.event = value || 'message';
      else if (field === 'data') this.data.push(value);
      else if (field === 'id') this.id = value;
      else if (field === 'retry' && /^\d+$/.test(value)) this.retryMs = Number(value);
    }
    return out;
  }
}

/** Exponential backoff with a ceiling, for reconnects. */
export function backoff(attempt: number, baseMs = 1000, maxMs = 30000): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
}
