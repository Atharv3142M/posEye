export type Vec3Tuple = [number, number, number];

export type ModelTransform = {
  axisConvention?: "z_up" | "z_up_to_y_up" | "y_up" | string;
  origin?: Vec3Tuple | null;
  crs?: string | null;
  source?: string;
};

export type Point3 = { x: number; y: number; z: number };

/** Returns true when a loaded GLB still needs R_x(-90deg) Z-up -> Y-up rotation in Three.js. */
export function shouldApplyZUpToYUp(
  modelTransform: ModelTransform | null | undefined,
  hasCesiumRtc: boolean
): boolean {
  const conv = modelTransform?.axisConvention;
  if (conv === "z_up_to_y_up" || conv === "y_up") {
    return false;
  }
  return conv === "z_up" || hasCesiumRtc;
}

/** Extracts extensions.CESIUM_RTC.center from a parsed GLTFLoader result if present. */
export function extractCesiumRtcCenter(gltf: any): Vec3Tuple | null {
  const c =
    gltf?.parser?.json?.extensions?.CESIUM_RTC?.center ??
    gltf?.scene?.CESIUM_RTC?.center;
  if (
    Array.isArray(c) &&
    c.length >= 3 &&
    Number.isFinite(c[0]) &&
    Number.isFinite(c[1]) &&
    Number.isFinite(c[2])
  ) {
    return [Number(c[0]), Number(c[1]), Number(c[2])];
  }
  return null;
}

/**
 * Recovers source coordinates (Easting, Northing, Height or X, Y, Z)
 * from a centered Three.js scene point.
 */
export function scenePointToSource(
  scenePoint: Point3,
  sceneCenter: Point3,
  options: {
    origin?: Vec3Tuple | null;
    isZUpToYUp?: boolean;
  } = {}
): { x: number; y: number; z: number } {
  const origin = options.origin ?? [0, 0, 0];
  const ux = scenePoint.x + sceneCenter.x;
  const uy = scenePoint.y + sceneCenter.y;
  const uz = scenePoint.z + sceneCenter.z;

  if (options.isZUpToYUp) {
    // R_x(-90deg) maps (E, N, H) -> (E, H, -N); invert back to (E, N, H).
    return {
      x: origin[0] + ux,
      y: origin[1] - uz,
      z: origin[2] + uy,
    };
  }

  return {
    x: origin[0] + ux,
    y: origin[1] + uy,
    z: origin[2] + uz,
  };
}
