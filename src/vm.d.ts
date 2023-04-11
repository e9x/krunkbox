declare module "vm" {
  interface SourceTextModule {
    createCachedData(): Buffer;
  }
}
