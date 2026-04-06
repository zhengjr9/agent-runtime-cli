export class BedrockClient {
  constructor(config = {}) {
    this.config = config
  }

  async send() {
    return {}
  }
}

export class ListInferenceProfilesCommand {
  constructor(input = {}) {
    this.input = input
  }
}

export class GetInferenceProfileCommand {
  constructor(input = {}) {
    this.input = input
  }
}
