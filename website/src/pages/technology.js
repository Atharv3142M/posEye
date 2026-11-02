import { initNav } from '../components/nav.js';
import { initSearch } from '../components/search.js';

const PIPELINE_STAGES = [
  {
    num: '01',
    name: 'Video & SRT Ingestion',
    tech: 'FFmpeg static binary / ffprobe',
    desc: 'Validates container integrity, extracts keyframes, demuxes subtitle stream, and probes baseline resolution, duration, and FPS.',
    input: 'Continuous drone video (.mp4/.mov) + subtitle stream (.srt)',
    output: 'Stream metadata JSON, raw video frames folder',
    details: 'Leverages static bundled FFmpeg to safely probe video parameters without system path dependencies.'
  },
  {
    num: '02',
    name: 'Telemetry Parsing & Sync',
    tech: 'Python regex / timestamp interpolation',
    desc: 'Parses geospatial coordinates, ellipsoidal altitude, ISO timestamp, and camera focal parameters from subtitle cues with millisecond interpolation.',
    input: 'SubRip SRT text cue blocks',
    output: 'Synchronized telemetry series (time, lat, lon, alt, roll, pitch, yaw)',
    details: 'Handles DJI, Autel, and standard subtitle telemetry conventions with sub-frame linear interpolation.'
  },
  {
    num: '03',
    name: 'Laplacian Blur Screening',
    tech: 'OpenCV cv2.Laplacian',
    desc: 'Computes variance of the Laplacian across each extracted frame. Blurry frames from rapid drone angular velocity are rejected.',
    input: 'Extracted raw frames',
    output: 'Sharp frame subset, blur variance score log',
    details: 'Dynamic thresholding discards frames where Var(∇²I) falls below adaptive survey baseline.'
  },
  {
    num: '04',
    name: 'Perceptual dHash Deduplication',
    tech: 'Difference Hash (dHash) algorithm',
    desc: 'Computes 64-bit gradient hashes to detect redundant frames during drone hover or slow forward velocity, ensuring optimal parallax overlap.',
    input: 'Sharp frames',
    output: 'Non-redundant frame sequence (target 70-80% forward overlap)',
    details: 'Maintains optimal baseline-to-height ratio (B/H) required for accurate photogrammetric stereopsis.'
  },
  {
    num: '05',
    name: 'EXIF GPS Geotagging',
    tech: 'piexif / WGS84 GPS tags',
    desc: 'Injects parsed coordinates, altitude, and camera model directly into frame EXIF headers (GPSLatitude, GPSLongitude, GPSAltitude).',
    input: 'Filtered frames + interpolated telemetry',
    output: 'Geotagged JPEG image set ready for photogrammetry',
    details: 'Formats degrees/minutes/seconds rational fractions according to EXIF 2.3 standard specifications.'
  },
  {
    num: '06',
    name: 'YOLOv8 Dynamic Masking (Optional)',
    tech: 'Ultralytics YOLOv8n segmentation',
    desc: 'Generates alpha masks for moving vehicles, pedestrians, and dynamic objects to prevent ghosting artifacts during bundle adjustment.',
    input: 'Geotagged JPEGs',
    output: 'Binary feature masks (.png) per frame',
    details: 'Excludes dynamic tie points from the bundle adjustment matrix without manual masking.'
  },
  {
    num: '07',
    name: 'Structure-from-Motion (SfM)',
    tech: 'OpenSfM / NodeODM Engine',
    desc: 'Detects SIFT/AKAZE scale-invariant features, computes pairwise feature matches, and runs incremental bundle adjustment to solve camera poses.',
    input: 'Geotagged image set',
    output: 'Calibrated camera poses, sparse tie-point cloud',
    details: 'Computes intrinsic camera calibration (focal length, principal point, radial distortion k1, k2).'
  },
  {
    num: '08',
    name: 'Multi-View Stereo (MVS)',
    tech: 'OpenMVS / PatchMatch Stereo',
    desc: 'Generates dense depth maps per frame and fuses them into a dense 3D point cloud with millions of spatial measurements.',
    input: 'Calibrated cameras + sparse cloud',
    output: 'Dense point cloud (ASPRS LAS / LAZ format)',
    details: 'Calculates depth confidence per pixel to eliminate outliers and atmospheric scattering.'
  },
  {
    num: '09',
    name: '2.5D Mesh Reconstruction',
    tech: 'Screened Poisson / Delaunay triangulation',
    desc: 'Extracts continuous polygonal surface geometry from dense point cloud, optimizing edge topology and filling occluded holes.',
    input: 'Dense point cloud with surface normals',
    output: 'Raw 3D surface mesh (.obj / .ply)',
    details: 'Constructs watertight manifold mesh while preserving sharp breaklines, ridges, and slopes.'
  },
  {
    num: '10',
    name: 'Texture Mapping & UV Packing',
    tech: 'Texturing pipeline / UV Atlas',
    desc: 'Projects original aerial drone imagery onto mesh faces with color blending, seam leveling, and ambient occlusion generation.',
    input: '3D mesh + original camera imagery',
    output: 'Textured 3D model (diffuse map + normal map)',
    details: 'Generates optimized UV charts with minimized distortion and seamless inter-camera color equalization.'
  },
  {
    num: '11',
    name: 'Multi-Format Export & CRS Conversion',
    tech: 'trimesh / pygltflib / GDAL',
    desc: 'Converts OBJ into interactive GLB, bundles LAZ point cloud and GeoTIFF orthophoto, and transforms coordinates into projected CRS (UTM).',
    input: 'Reconstruction archive',
    output: 'model.glb (viewer), pointcloud.laz, orthophoto.tif',
    details: 'Applies coordinate axis re-orientation (Z-up to Y-up) for WebGL compatibility while preserving UTM metadata.'
  }
];

document.addEventListener('DOMContentLoaded', () => {
  initNav('technology');
  initSearch();

  const stageList = document.getElementById('pipeline-stage-list');
  const stageDetail = document.getElementById('stage-detail-box');

  if (stageList && stageDetail) {
    function renderDetail(stage) {
      stageDetail.innerHTML = `
        <div class="pill" style="margin-bottom: 12px;"><span class="pill-dot"></span> STAGE ${stage.num} · ARCHITECTURE</div>
        <h3 style="font-size: 1.6rem; margin-bottom: 8px;">${stage.name}</h3>
        <p style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--orange); margin-bottom: 18px;">Tech: ${stage.tech}</p>
        <p style="font-size: 1rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 24px;">${stage.desc}</p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
          <div style="background: var(--bg); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 6px;">Input Contract</div>
            <div style="font-size: 0.85rem; color: var(--text-main); font-weight: 600;">${stage.input}</div>
          </div>
          <div style="background: var(--bg); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 6px;">Output Artifact</div>
            <div style="font-size: 0.85rem; color: var(--orange); font-weight: 600;">${stage.output}</div>
          </div>
        </div>
        
        <div style="background: rgba(255, 87, 40, 0.05); padding: 16px; border-radius: var(--radius-sm); border-left: 3px solid var(--orange); font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">
          <strong>Implementation Note:</strong> ${stage.details}
        </div>
      `;
    }

    // Render initial stage
    renderDetail(PIPELINE_STAGES[0]);

    // Handle stage list item clicks
    const stageItems = stageList.querySelectorAll('.stage-item');
    stageItems.forEach((item, idx) => {
      item.addEventListener('click', () => {
        stageItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        renderDetail(PIPELINE_STAGES[idx]);
      });
    });
  }
});
