# posEye — Third-Party Notices & Open Source Attributions

posEye incorporates, bundles, or interfaces with several open-source and third-party libraries and binaries. This document provides notice of the licenses and copyright terms governing these components.

---

## 1. Bundled Binary Distributions

### FFmpeg (Static Windows x64 Binary)
- **Component:** `ffmpeg.exe` (bundled in application `resources/`)
- **License:** GNU General Public License v3.0 / Lesser General Public License v2.1+
- **Origin / Source:** Compiled from official sources via [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) / [FFmpeg Project](https://ffmpeg.org).
- **Notice:** FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project. Source code and compilation scripts for the distributed build are available at https://ffmpeg.org and https://www.gyan.dev/ffmpeg/builds/.

### PyInstaller Bootloader (Compiled Orchestrator)
- **Component:** `orchestrator.exe` (bundled in application `resources/`)
- **License:** GNU General Public License v2.0 with a Special Exception (PyInstaller Exception).
- **Notice:** The standalone executable produced by PyInstaller contains the PyInstaller bootloader. The PyInstaller exception permits bundling and redistributing programs created with PyInstaller under terms of the author's choice without requiring the entire output work to be licensed under GPLv2.

---

## 2. Integrated Photogrammetry Core

### OpenDroneMap (ODM) / NodeODM
- **Component:** Docker container image `opendronemap/nodeodm:latest`
- **License:** GNU General Public License v3.0 (GPLv3)
- **Copyright:** (c) 2014-2026 OpenDroneMap contributors
- **Notice:** posEye communicates with NodeODM over standard local HTTP REST and WebSocket APIs (`http://localhost:3000`). No proprietary modifications are linked into the NodeODM core. Source code is available at https://github.com/OpenDroneMap/NodeODM and https://github.com/OpenDroneMap/ODM.

---

## 3. Desktop Application & Viewer Libraries

### Electron
- **License:** MIT License
- **Copyright:** (c) Electron contributors / OpenJS Foundation
- **Permission Notice:**
  ```
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
  ```

### Three.js
- **License:** MIT License
- **Copyright:** (c) 2010-2026 Three.js authors
- **Permission Notice:**
  The MIT License applies to the Three.js 3D rendering engine, OrbitControls, and GLTFLoader modules used in posEye's 3D inspection viewport.

### React, React-DOM & React Router
- **License:** MIT License
- **Copyright:** (c) Meta Platforms, Inc. and affiliates; (c) Remix Software Inc.

### Vite
- **License:** MIT License
- **Copyright:** (c) 2019-present Evan You & Vite contributors

---

## 4. Python Backend & Preprocessing Libraries

### OpenCV (`opencv-python-headless`)
- **License:** Apache License 2.0
- **Copyright:** (c) OpenCV team and contributors

### NumPy
- **License:** BSD 3-Clause License
- **Copyright:** (c) 2005-2026, NumPy Developers

### Piexif
- **License:** MIT License
- **Copyright:** (c) 2019 hMatoba

### FastAPI & Starlette
- **License:** MIT License
- **Copyright:** (c) 2018-present Sebastián Ramírez; (c) Encode OSS Ltd

### Uvicorn
- **License:** BSD 3-Clause License
- **Copyright:** (c) Encode OSS Ltd

### Trimesh
- **License:** MIT License
- **Copyright:** (c) 2019 Michael Dawson-Haggerty

### PyGLTFlib
- **License:** MIT License
- **Copyright:** (c) 2019 Luke Miller

### HTTPX
- **License:** BSD 3-Clause License
- **Copyright:** (c) 2019 Encode OSS Ltd

---

## 5. Summary of Redistribution Obligations

1. **Reciprocal Source Availability:**
   - Any distribution containing the GPLv3 posEye application must make available the complete corresponding source code under the GNU General Public License v3.0.
2. **Attribution & Notice Preservation:**
   - All notices, copyright lines, and disclaimer clauses contained in this document must be preserved in binary distributions and derivative source packages.
3. **No Trademark Grant:**
   - Nothing in this repository or in the third-party licenses grants permission to use the trade names, trademarks, or service marks of the respective authors or projects without prior written permission.

