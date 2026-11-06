/** Filtering affects only the current view; it does not change model toggles or the server-side catalog. */
export function filterModels(catalog, { search = '', channel = 'all', capability = 'all', availability = 'all', access = 'all' }) {
  const query = search.trim().toLocaleLowerCase()
  return catalog.filter(model =>
    (channel === 'all' || model.channel === channel)
    && (capability === 'all' || (capability === 'vision' ? model.vision : capability === 'reasoning' ? model.reasoning : !model.vision))
    && (availability === 'all' || (model.availability ?? 'unknown') === availability)
    && (access === 'all' || (access === 'routable' ? model.routable : !model.routable))
    && `${model.name} ${model.id}`.toLocaleLowerCase().includes(query))
}
