export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      err?.code === 'ERR_MODULE_NOT_FOUND'
      && (specifier.startsWith('./') || specifier.startsWith('../'))
      && !specifier.endsWith('.js')
      && !specifier.endsWith('.mjs')
      && !specifier.endsWith('.json')
    ) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw err;
  }
}
