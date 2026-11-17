/** The URL the caller serves `pdf-assets/` at, ending in a slash. */
export let assets: string | undefined

/** Once per page, before the first PDF opens. */
export function configurePdf(options: { assets: string }): void {
  assets = options.assets.replace(/\/?$/, '/')
}
