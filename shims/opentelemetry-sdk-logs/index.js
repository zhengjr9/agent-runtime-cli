export class ConsoleLogRecordExporter {}

export class BatchLogRecordProcessor {
  constructor(exporter, options = {}) {
    this.exporter = exporter
    this.options = options
  }

  async forceFlush() {}
  async shutdown() {}
}

export class LoggerProvider {
  constructor(options = {}) {
    this.options = options
  }

  addLogRecordProcessor() {}

  getLogger() {
    return {
      emit() {},
    }
  }

  async forceFlush() {}
  async shutdown() {}
}
