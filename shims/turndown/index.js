export default class TurndownService {
  turndown(input) {
    return typeof input === 'string' ? input : ''
  }
}
