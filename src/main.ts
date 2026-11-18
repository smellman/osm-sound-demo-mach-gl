import './style.scss'
import type { GeoloniaMap } from './geolonia'
import {
  ListItem,
  Release,
  Track,
  fetchAllReleases,
  fetchReleaseById,
} from './otherman-records'
import 'bootstrap'

const linkBase = "https://www.otherman-records.com/releases/"
const proxyURL = "https://proxy.smellman.org/proxy/"

let currentRelease: Release | null = null
let currentTrack: Track | null = null
let currentTrackIndex = 0
let currentUrl = ""
let currentTitle = ""
let currentLink = ""

// MachGL (loaded from cdn.geolonia.com in index.html) builds the map from the data-* attributes of #map.
const map: GeoloniaMap = new window.geolonia.Map('#map')
map.setMaxPitch(85)

// The original demo looks at the city with a pitch of 70°. With MachGL on a 2560x1440 screen (pixel ratio 2),
// 70° drew 44 frames per second while turning, loading 26 tiles up to the horizon; 60° drew 60 with 9 tiles.
// data-pitch in index.html sets the same pitch for the first view.
const viewPitch = 60

// Drawing slowed down on large, high-resolution screens (a 5120x2772 canvas), and ran at 60 frames per
// second with about 3.5 million pixels. So the pixel ratio is lowered to keep the canvas under maxCanvasPixels.
const maxCanvasPixels = 4_000_000
const container = document.getElementById('map') as HTMLDivElement
const fitPixelRatio = () => {
  const cssPixels = container.clientWidth * container.clientHeight
  if (cssPixels > 0) {
    map.setPixelRatio(Math.min(window.devicePixelRatio, Math.sqrt(maxCanvasPixels / cssPixels)))
  }
}
fitPixelRatio()
// MachGL draws at most 30 frames per second by default; lift that so the buildings follow the music smoothly.
map.setMaxFrameRate(null)

const context = new AudioContext()
let musicBuffer: AudioBuffer | null = null
const bins = 16
const analyser = context.createAnalyser()
const gainNode = context.createGain()
gainNode.gain.value = 1.0 // default volume
analyser.minDecibels = -90
analyser.maxDecibels = -10
analyser.smoothingTimeConstant = 0.05
analyser.fftSize = bins * 2
let bufferSource: AudioBufferSourceNode | null = null
let loaded = false
let playing = false
let flyTo = false
let vjMode = false
let waveMode = false
const numberOfChannels = 2
const sampleRate = 44100

const playSilence = () => {
  const buf = context.createBuffer(numberOfChannels, 1, sampleRate)
  const src = context.createBufferSource()
  src.buffer = buf
  src.connect(context.destination)
  src.start(0)
}

const play = (buffer: AudioBuffer) => {
  bufferSource = context.createBufferSource()
  bufferSource.buffer = buffer
  bufferSource.loop = true
  bufferSource.connect(context.destination)
  bufferSource.connect(analyser)
  bufferSource.start(context.currentTime + 0.100)
}

let audio: HTMLAudioElement | null = null

const turnOnVJMode = async () => {
  vjMode = true
  if (audio) {
    audio.pause()
    audio = null
  }
  if (bufferSource) {
    bufferSource.stop()
    bufferSource = null
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const streamSource = context.createMediaStreamSource(stream)
  streamSource.connect(gainNode)
  gainNode.connect(analyser)
  gainNode.gain.value = 1.0 // Set a default volume for VJ mode
  loaded = true
  musicBuffer = context.createBuffer(numberOfChannels, 1, sampleRate)
  playing = true
  play(musicBuffer)
  requestId = requestAnimationFrame(draw)
  // setInterval(() => {
  //   if (!flyTo) {
  //     jumpToRandomLocation()
  //   }
  // }, 60000) // Jump to a random location after 60 seconds
}

const loadSound = (url: string) => {
  // play silent
  playSilence()

  // Streaming audio
  audio = new Audio(url)
  audio.crossOrigin = 'anonymous'
  const source = context.createMediaElementSource(audio)
  source.connect(gainNode)
  gainNode.connect(analyser)
  gainNode.connect(context.destination)
  audio.play().then(() => {
    loaded = true
    musicBuffer = context.createBuffer(numberOfChannels, 1, sampleRate)
    if (playing) {
      play(musicBuffer)
    }
  }).catch(error => {
    console.error('Error playing audio:', error)
  })
  audio.addEventListener('ended', () => {
    console.log('Audio ended, playing next track')
    playNext()
  }, false)
}
let dataArray: Uint8Array<ArrayBuffer> | null = null

const changeRelease = (id: string) => {
  console.log('Changing release to:', id)
  if (currentRelease !== null && currentRelease.id === id) {
    return // No change if the same release is selected
  }
  fetchReleaseById(id).then(release => {
    if (release) {
      console.log('Fetched release:', release)
      if (currentRelease == null || currentRelease.id !== release.id) {
        currentRelease = release
        currentTrackIndex = 0
        currentTrack = release.tracklist[0] || null
        stopTrack() // Stop any currently playing track
        setupTitleAndLink()
      }
    } else {
      console.error('Release not found:', id)
    }
  }).catch(error => {
    console.error('Error fetching release:', error)
  })
}

const releaseList = document.getElementById('release-list') as HTMLDivElement
const select = releaseList.querySelector('select') as HTMLSelectElement
select.addEventListener('change', (event) => {
  const selectedId = (event.target as HTMLSelectElement).value
  if (selectedId) {
    changeRelease(selectedId)
  }
})
map.on('load', () => {
  // data-style loads the style as is, so the sky of the original demo is set here.
  map.setSky({
    "sky-color": "#199EF3",
    "sky-horizon-blend": 0.5,
    "horizon-color": "#ffffff",
    "horizon-fog-blend": 0.5,
    "fog-color": "#0000ff",
    "fog-ground-blend": 0.5,
    "atmosphere-blend": [
      "interpolate",
      ["linear"],
      ["zoom"],
      0,
      1,
      10,
      1,
      12,
      0
    ]
  })

  // fetch Otherman Records releases
  fetchAllReleases().then(releases => {
    releases.forEach((release: ListItem) => {
      const option = document.createElement('option')
      option.value = release.id
      option.textContent = `[${release.id}] ${release.title} / ${release.artist1} ${release.artist2 ? release.artist2 : ""}`
      select.appendChild(option)
    })
  })

  // The buildings get a source of their own, with the same tiles as the style's openmaptiles.
  // With MachGL, changing a filter of these layers (moving the wave rings) then settled in about
  // 0.2 s instead of about 3 s.
  map.addSource('buildings', {
    type: 'vector',
    url: map.getStyle().sources['openmaptiles'].url,
  })

  const maxHeight = 200
  const binWidth = maxHeight / bins

  // Divide the buildings into 16 bins based on their true height, using a layer filter.
  for (let i = 0; i < bins; i++) {
    addSteppedLayers('3d-buildings', i, binHeights(i), {
      'filter': [
        'all',
        ['>', 'render_height', i * binWidth],
        ['<=', 'render_height', (i + 1) * binWidth]
      ],
    })
  }
  dataArray = new Uint8Array(bins) as Uint8Array<ArrayBuffer>
})

// With MachGL, a new fill-extrusion-height took about 3 s to show, so setting it every frame (as the
// original demo does) left the buildings flat, while a new visibility showed in the next frame.
// So each group of buildings gets one layer per height step, and a frame switches which one is visible.
// 16 steps (256 layers for the bins) loaded in about 1 s; 32 steps took about 2.5 s.
const heightSteps = 16

// Each frame moves the shown height part of the way to the music's, quickly up and slowly down,
// so the buildings pass through the steps in between instead of jumping.
const riseRate = 0.5
const fallRate = 0.15

// The step shown and the smoothed height (0..1) of each group of buildings.
interface SteppedGroups {
  steps: number[]
  levels: number[]
}

const newGroups = (count: number): SteppedGroups => ({
  steps: new Array<number>(count).fill(0),
  levels: new Array<number>(count).fill(0),
})

const addSteppedLayers = (prefix: string, index: number, heights: number[], options: Record<string, unknown>) => {
  for (let step = 0; step < heightSteps; step++) {
    map.addLayer({
      'id': `${prefix}-${index}-${step}`,
      'source': 'buildings',
      'source-layer': 'building',
      'type': 'fill-extrusion',
      ...options,
      'layout': {
        'visibility': step === 0 ? 'visible' : 'none'
      },
      'paint': {
        'fill-extrusion-color': '#aaa',
        'fill-extrusion-height': heights[step],
        'fill-extrusion-opacity': 0.6
      }
    })
  }
}

// Steps from the lowest to the highest height of a bin in the original demo: 10 + 4 * i + (0..255).
const binHeights = (i: number) =>
  Array.from({ length: heightSteps }, (_, step) => 10 + 4 * i + (255 * step) / (heightSteps - 1))
const binGroups = newGroups(bins)

// Moves the group's height toward value (0..max), shows the step nearest to it, and hides the step shown before.
const showLevel = (prefix: string, groups: SteppedGroups, index: number, value: number, max: number) => {
  const target = Math.min(Math.max(value, 0), max) / max
  const level = groups.levels[index]
  groups.levels[index] = level + (target - level) * (target > level ? riseRate : fallRate)
  const step = Math.round(groups.levels[index] * (heightSteps - 1))
  if (groups.steps[index] === step) {
    return
  }
  map.setLayoutProperty(`${prefix}-${index}-${groups.steps[index]}`, 'visibility', 'none')
  map.setLayoutProperty(`${prefix}-${index}-${step}`, 'visibility', 'visible')
  groups.steps[index] = step
}

const waveRings = 24
const waveRingWidth = 80 // meters
const waveMaxHeight = 250 // meters: 10 + 255 * 0.8 + a ripple of up to 30
const waveDelayFrames = 3 // how many frames the wave takes to travel one ring
const energyHistory = new Float32Array(waveRings * waveDelayFrames)
let energyHistoryIndex = 0
const waveGroups = newGroups(waveRings)

// Rebuild ring filters so the wave spreads out from the current map center.
const updateWaveFilters = () => {
  const { lng, lat } = map.getCenter()
  const center = { type: 'Point', coordinates: [lng, lat] }
  for (let i = 0; i < waveRings; i++) {
    const filter: any[] = ['all', ['>=', ['distance', center], i * waveRingWidth]]
    if (i < waveRings - 1) {
      filter.push(['<', ['distance', center], (i + 1) * waveRingWidth])
    }
    for (let step = 0; step < heightSteps; step++) {
      map.setFilter(`3d-buildings-wave-${i}-${step}`, filter)
    }
  }
}

map.on('moveend', () => {
  if (waveMode) {
    updateWaveFilters()
  }
})

const setWaveMode = (enabled: boolean) => {
  waveMode = enabled
  for (let i = 0; i < bins; i++) {
    map.setLayoutProperty(`3d-buildings-${i}-${binGroups.steps[i]}`, 'visibility', enabled ? 'none' : 'visible')
  }
  // The rings (24 x 8 layers) are only on the map while wave mode is on.
  if (enabled) {
    const heights = Array.from({ length: heightSteps }, (_, step) => (waveMaxHeight * step) / (heightSteps - 1))
    for (let i = 0; i < waveRings; i++) {
      addSteppedLayers('3d-buildings-wave', i, heights, {})
      waveGroups.steps[i] = 0
      waveGroups.levels[i] = 0
    }
    updateWaveFilters()
  } else {
    for (let i = 0; i < waveRings; i++) {
      for (let step = 0; step < heightSteps; step++) {
        map.removeLayer(`3d-buildings-wave-${i}-${step}`)
      }
    }
  }
}

const drawWave = (now: DOMHighResTimeStamp) => {
  // Use the low frequencies (beat) as the energy that travels outward.
  let energy = 0
  for (let i = 0; i < 4; i++) {
    energy += dataArray![i]
  }
  energy /= 4
  energyHistoryIndex = (energyHistoryIndex + 1) % energyHistory.length
  energyHistory[energyHistoryIndex] = energy

  for (let i = 0; i < waveRings; i++) {
    const index = (energyHistoryIndex - i * waveDelayFrames + energyHistory.length) % energyHistory.length
    const delayed = energyHistory[index]
    const ripple = Math.sin(now / 200 - i * 0.5) * (delayed / 255) * 30
    showLevel('3d-buildings-wave', waveGroups, i, 10 + delayed * 0.8 + ripple, waveMaxHeight)
  }
}

let requestId: number | null = null

const draw = (now: DOMHighResTimeStamp) => {
  if (flyTo) {
    requestId = requestAnimationFrame(draw)
    return
  }
  if (!dataArray) {
    return
  }
  analyser.getByteFrequencyData(dataArray!)
  let avg = 0
  for (let i = 0; i < bins; i++) {
    avg += dataArray[i]
    if (!waveMode) {
      showLevel('3d-buildings', binGroups, i, dataArray[i], 255)
    }
  }
  avg /= bins
  if (waveMode) {
    drawWave(now)
  }
  map.setBearing(now / 500)
  map.setLight({
    color:
      'hsl(' +
      ((now / 100) % 360) +
      ',' +
      Math.min(50 + avg / 4, 100) +
      '%,50%)',
      intensity: Math.min(1, (avg / 256) * 10)
  })

  requestId = requestAnimationFrame(draw)
}


const playButton = document.getElementById('play-button') as HTMLButtonElement
const title = document.getElementById('current-track') as HTMLSpanElement
const link = document.getElementById('current-link') as HTMLAnchorElement
if (playButton) {
  playButton.addEventListener('click', () => {
    console.log('Play button clicked, playing:', playing)
    if (!playing) {
      playTrack()
    } else {
      stopTrack()
    }
  }, false)
}

const setupProxyUrl = (url: string) => {
  const urlObj = url.split("//")
  if (urlObj.length > 1) {
    return proxyURL + encodeURIComponent(urlObj[1])
  }
  return url
}

const setupTitleAndLink = () => {
  if (currentTrack) {
    currentTitle = `${currentTrack.title} / ${currentRelease?.artist1} ${currentRelease?.artist2 ? currentRelease.artist2 : ""}`
    currentLink = linkBase + currentRelease!.id
    title.textContent = currentTitle
    link.href = currentLink
    link.target = "_blank"
  } else {
    currentTitle = "No track selected, please select a release."
    currentLink = "#"
    title.textContent = currentTitle
    link.href = currentLink
    link.target = ""
  }
}

const playTrack = () => {
  if (currentTrack) {
    currentUrl = setupProxyUrl(currentTrack.url)
    if (!loaded) {
      loadSound(currentUrl)
    } else {
      playSilence()
      if (musicBuffer) {
        play(musicBuffer)
      }
    }
    requestId = requestAnimationFrame(draw)
    playButton.innerHTML = '<i class="bi bi-stop-fill"></i>'
    playing = true
  } else {
    console.log('Play button clicked, stopping:', currentTrack)
  }
}

const stopTrack = () => {
  if (loaded) {
    !bufferSource || bufferSource.stop()
    bufferSource = null
    loaded = false
  }
  if (audio) {
    audio.pause()
    audio.currentTime = 0
    audio = null
  }
  if (requestId) {
    cancelAnimationFrame(requestId)
    requestId = null
  }
  playButton.innerHTML = '<i class="bi bi-play-fill"></i>'
  playing = false
}

const playNext = () => {
  if (currentRelease) {
    currentTrackIndex = (currentTrackIndex + 1) % currentRelease.tracklist.length
    currentTrack = currentRelease.tracklist[currentTrackIndex]
    setupTitleAndLink()
    if (playing) {
      stopTrack()
      playTrack()
    }
  }
}

const playPrevious = () => {
  if (currentRelease) {
    currentTrackIndex = (currentTrackIndex - 1 + currentRelease.tracklist.length) % currentRelease.tracklist.length
    currentTrack = currentRelease.tracklist[currentTrackIndex]
    setupTitleAndLink()
    if (playing) {
      stopTrack()
      playTrack()
    }
  }
}

const nextButton = document.getElementById('next-button') as HTMLButtonElement
if (nextButton) {
  nextButton.addEventListener('click', () => {
    console.log('Next button clicked')
    playNext()
  })
}

const previousButton = document.getElementById('prev-button') as HTMLButtonElement
if (previousButton) {
  previousButton.addEventListener('click', () => {
    console.log('Previous button clicked')
    playPrevious()
  })
}

const waveButton = document.getElementById('wave-button') as HTMLButtonElement
if (waveButton) {
  waveButton.addEventListener('click', () => {
    setWaveMode(!waveMode)
    waveButton.classList.toggle('active', waveMode)
  })
}

const volumeButton = document.getElementById('volume-button') as HTMLButtonElement
if (volumeButton) {
  volumeButton.addEventListener('click', () => {
    const existing = document.getElementById('volume-control')
    if (existing) {
      existing.remove()
      return
    }
    const popup = document.createElement('div')
    popup.id = 'volume-control'
    popup.className = 'volume-control-popup'

    const range = document.createElement('input')
    range.type = 'range'
    range.min = '0'
    range.max = '1'
    range.step = '0.01'
    range.value = gainNode.gain.value.toString()
    range.addEventListener('input', () => {
      gainNode.gain.value = parseFloat(range.value)
    })
    popup.appendChild(range)
    document.body.appendChild(popup)

    const rect = volumeButton.getBoundingClientRect()
    popup.style.left = `${rect.right}px`
    popup.style.top = `${rect.top - 120 - 10}px`
  })
}

const flyToLinks = document.querySelectorAll('#flyTo a')
flyToLinks.forEach(link => {
  link.addEventListener('click', () => {
    const longitude = parseFloat(link.getAttribute('data-longitude') || '0')
    const latitude = parseFloat(link.getAttribute('data-latitude') || '0')
    map.flyTo({
      center: [longitude, latitude],
      zoom: 16,
      pitch: viewPitch,
      bearing: 0,
      speed: 1.2,
      curve: 1.42,
      easing(t) {
        return t
      },
      essential: true // this animation is considered essential with respect to prefers-reduced-motion
    })
    flyTo = true
    map.once('moveend', () => {
      flyTo = false
    })
  })
})

// const jumpToRandomLocation = () => {
//   const randomLink = flyToLinks[Math.floor(Math.random() * flyToLinks.length)]
//   const longitude = parseFloat(randomLink.getAttribute('data-longitude') || '0')
//   const latitude = parseFloat(randomLink.getAttribute('data-latitude') || '0')
//   map.flyTo({
//     center: [longitude, latitude],
//     zoom: 16,
//     pitch: viewPitch,
//     bearing: 0,
//     speed: 1.2,
//     curve: 1.42,
//     easing(t) {
//       return t
//     },
//     essential: true // this animation is considered essential with respect to prefers-reduced-motion
//   })
//   flyTo = true
//   map.once('moveend', () => {
//     flyTo = false
//   })
// }

const locateButton = document.getElementById('locate-button') as HTMLButtonElement
if (locateButton) {
  locateButton.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords
        map.flyTo({
          center: [longitude, latitude],
          zoom: 16,
          pitch: viewPitch,
          bearing: 0,
          speed: 1.2,
          curve: 1.42,
          easing(t) {
            return t
          },
          essential: true // this animation is considered essential with respect to prefers-reduced-motion
        })
        flyTo = true
        map.once('moveend', () => {
          flyTo = false
        })
      }, (error) => {
        console.error('Error getting location:', error)
      })
    } else {
      console.error('Geolocation is not supported by this browser.')
    }
  })
}

const vjModeButton = document.getElementById('turn-on-vj-mode') as HTMLAnchorElement
if (vjModeButton) {
  vjModeButton.addEventListener('click', async (event) => {
    event.preventDefault()
    if (vjMode) {
      console.log('VJ Mode is already on')
      return
    }
    try {
      await turnOnVJMode()
      hideAllButtonNavbar()
      adjustMapForNavbar()
      } catch (error) {
      console.error('Error turning on VJ Mode:', error)
    }
  })
  if (navigator.mediaDevices.getUserMedia === undefined) {
    vjModeButton.style.display = 'none' // Hide button if getUserMedia is not supported
  }
}

const hideAllButtonNavbar = () => {
  const navbar = document.querySelector('.navbar') as HTMLDivElement
  if (navbar) {
    navbar.style.display = 'none'
  }
  const buttons = document.querySelectorAll('.btn')
  buttons.forEach(button => {
    (button as HTMLButtonElement).style.display = 'none'
  })
}

// Update the title and link
setupTitleAndLink()

// tweek nav bar height for mobile
const adjustMapForNavbar = () => {
  const navbar = document.querySelector('.navbar') as HTMLDivElement
  const map = document.getElementById('map') as HTMLDivElement
  if (navbar && map) {
    const navbarHeight = navbar.offsetHeight
    const viewportHeight = window.innerHeight
    map.style.height = `${viewportHeight - navbarHeight}px`
  }
}

window.addEventListener('resize', adjustMapForNavbar)
window.addEventListener('resize', fitPixelRatio)
window.addEventListener('orientationchange', adjustMapForNavbar)
document.addEventListener('DOMContentLoaded', adjustMapForNavbar)
