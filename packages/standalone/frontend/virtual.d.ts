declare module 'ofm-provider-list' {
  export interface Provider { id: string; name: string; org: string; accent: string; note: string; login: string }
  export const providers: Provider[]
}
declare module 'ofm-shared-client' {
  // The channel pages come from the untyped original plugin and are exported through the build adapter.
  export const shared: Record<string, any>
}
