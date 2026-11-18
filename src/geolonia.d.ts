// Types for the parts of `window.geolonia` used by this demo: the MapLibre GL JS compatible map of MachGL,
// plus setMaxFrameRate of MachGL.

export interface LngLat {
  lng: number
  lat: number
}

export interface FlyToOptions {
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  speed?: number
  curve?: number
  easing?: (t: number) => number
  essential?: boolean
}

export interface GeoloniaMap {
  on(type: string, listener: (...args: any[]) => void): this
  once(type: string, listener: (...args: any[]) => void): this
  getStyle(): { sources: Record<string, { url?: string }> }
  addSource(id: string, source: Record<string, unknown>): this
  addLayer(layer: Record<string, unknown>, beforeId?: string): this
  removeLayer(id: string): this
  setFilter(layerId: string, filter: unknown): this
  setLayoutProperty(layerId: string, name: string, value: unknown): this
  setLight(light: Record<string, unknown>): this
  setSky(sky: Record<string, unknown>): this
  setMaxPitch(maxPitch?: number | null): this
  setPixelRatio(pixelRatio: number): this
  // MachGL's own API (not in MapLibre GL JS): the most frames drawn per second, or null for no limit.
  setMaxFrameRate(maxFrameRate: number | null): this
  setBearing(bearing: number): this
  getCenter(): LngLat
  flyTo(options: FlyToOptions): this
}

declare global {
  interface Window {
    geolonia: {
      Map: new (container: string | HTMLElement) => GeoloniaMap
    }
  }
}
