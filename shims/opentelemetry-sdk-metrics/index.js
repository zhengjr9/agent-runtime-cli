export const AggregationTemporality = {
  DELTA: 0,
  CUMULATIVE: 1,
}

export class ConsoleMetricExporter {
  export(_metrics, callback) {
    if (typeof callback === 'function') callback({ code: 0 })
  }
}

export class PeriodicExportingMetricReader {
  constructor(options = {}) {
    this.options = options
  }

  async forceFlush() {}
  async shutdown() {}
}

export class MeterProvider {
  constructor(options = {}) {
    this.options = options
  }

  addMetricReader() {}

  getMeter() {
    return {
      createCounter() {
        return { add() {} }
      },
      createHistogram() {
        return { record() {} }
      },
      createUpDownCounter() {
        return { add() {} }
      },
      createObservableGauge() {
        return { addCallback() {} }
      },
      createGauge() {
        return { record() {} }
      },
    }
  }

  async forceFlush() {}
  async shutdown() {}
}
