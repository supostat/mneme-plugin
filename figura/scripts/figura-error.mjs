export class FiguraError extends Error {
  constructor(code, what, remedy) {
    super(remedy === undefined ? `${code}: ${what}` : `${code}: ${what} — ${remedy}`);
    this.name = 'FiguraError';
    this.code = code;
    this.what = what;
    this.remedy = remedy;
  }
}
