import * as THREE from 'three';
import type { GLTF, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXTENSION_NAME, parseSceneExtension, type MoodyScene } from './sceneExtension';

/** What the plugin leaves on `gltf.userData`: the parsed extension and its lightmap textures. */
export interface LoadedMoodyScene {
  scene: MoodyScene;
  /** By Unity lightmap index; null where the entry or its texture could not be read. */
  lightmaps: (THREE.Texture | null)[];
}

const USER_DATA_KEY = 'moodyBluesScene';

/** The game-look data a loaded GLB carries, or null when it has no (readable) `MOODYBLUES_scene`. */
export function loadedMoodySceneOf(gltf: Pick<GLTF, 'userData'>): LoadedMoodyScene | null {
  return (gltf.userData?.[USER_DATA_KEY] as LoadedMoodyScene | undefined) ?? null;
}

/** Makes a lightmap texture ready to be sampled as data: linear, unflipped, on the second UV set, edges clamped. */
function configureLightmap(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.channel = 1;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Reads the root extension while the file loads and resolves the lightmap textures through the
 * parser (so a KTX2 image goes through the same transcoder as every other texture). The result is on
 * `gltf.userData` (see {@link loadedMoodySceneOf}). The extension is never required, so a file
 * without it loads exactly as before.
 */
export class MoodyBluesScenePlugin implements GLTFLoaderPlugin {
  readonly name = EXTENSION_NAME;

  private readonly parser: GLTFParser;

  constructor(parser: GLTFParser) {
    this.parser = parser;
  }

  async afterRoot(result: GLTF): Promise<void> {
    const scene = parseSceneExtension((this.parser.json.extensions as Record<string, unknown> | undefined)?.[EXTENSION_NAME]);
    if (!scene) return;
    const lightmaps = await Promise.all(
      scene.lightmaps.map(async (entry) => {
        if (!entry) return null;
        try {
          return configureLightmap((await this.parser.getDependency('texture', entry.texture)) as THREE.Texture);
        } catch (err) {
          console.debug('[viewer] lightmap texture failed to load:', err);
          return null;
        }
      }),
    );
    result.userData[USER_DATA_KEY] = { scene, lightmaps } satisfies LoadedMoodyScene;
  }
}
