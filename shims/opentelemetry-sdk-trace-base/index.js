class NoopSpan {
  constructor() {
    this._context = { spanId: '' }
  }

  spanContext() {
    return this._context
  }

  setAttribute() {}
  setAttributes() {}
  addEvent() {}
  recordException() {}
  setStatus() {}
  end() {}
}

class NoopTracer {
  startSpan() {
    return new NoopSpan()
  }
}

export class ConsoleSpanExporter {}

export class BatchSpanProcessor {
  constructor(exporter, options = {}) {
    this.exporter = exporter
    this.options = options
  }

  async forceFlush() {}
  async shutdown() {}
}

export class BasicTracerProvider {
  constructor(options = {}) {
    this.options = options
  }

  addSpanProcessor() {}

  getTracer() {
    return new NoopTracer()
  }

  async forceFlush() {}
  async shutdown() {}
}
