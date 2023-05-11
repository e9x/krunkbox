export interface KruCount {
  skinsDataBin: number;
  coreDataBin: number;
}

export interface KruSource {
  source: string;
  renamed: Record<string, string>;
  token: string;
  /**
   * `window.skinfx`
   */
  skins: string;
}
