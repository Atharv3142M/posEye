# Security Policy

posEye takes the security of its desktop application, data isolation, and processing pipeline seriously.

---

## 1. Supported Versions

Security updates and patches are actively provided for the following versions:

| Version | Supported | Status |
| :--- | :---: | :--- |
| `0.1.9` | **Yes** | Current active release |
| `0.1.8` / `0.1.8.1` | **Yes** | Previous stable release |
| `0.1.7` | **Yes** | Maintenance pre-release |
| `< 0.1.0` | **No** | Deprecated development prototypes |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability or potential threat in posEye, please report it responsibly:

- **Preferred Method:** Use GitHub's **Private Vulnerability Reporting** feature:
  Navigate to [Security Advisories](https://github.com/Atharv3142M/posEye/security/advisories) -> **Report a vulnerability**.
- **Alternative Contact:** If private advisories are unavailable, contact the project maintainers via email at `security@poseye.local` (or file a confidential issue with a maintainer).

### Please Include:
- A clear description of the vulnerability.
- Steps to reproduce or proof-of-concept payload (e.g. a malformed `.SRT` or corrupted video container).
- Potential impact on the host system or local processing.

### Response Timelines:
- **Initial Acknowledgement:** Within 48 hours.
- **Triage & Assessment:** Within 5 business days.
- **Patch Release:** As soon as a verified fix is available.

Please do not disclose security vulnerabilities publicly in GitHub Issues or public forums before a fix has been released.

---

## 3. Architecture & Security Considerations

posEye is designed with an offline-first, local-isolation security architecture:

1. **Loopback-Only Host Binding:**
   - Both the Python Orchestrator API (`http://127.0.0.1:8765`) and the NodeODM Docker container (`http://127.0.0.1:3000`) bind exclusively to loopback addresses (`127.0.0.1`), preventing external network access to the processing pipeline.
2. **Session-Scoped Bearer Tokens:**
   - The Orchestrator requires a dynamic session bearer token (`DT_API_TOKEN`) passed via HTTP `Authorization: Bearer <token>` or WebSocket subprotocol `['poseye-auth.<token>']`. Query-string tokens are rejected.
3. **Privileged Scheme & CORS Isolation:**
   - Packaged Electron runs under the privileged `poseye://app` origin. FastAPI CORS strictly restricts origins to `poseye://app` and development ports (`http://127.0.0.1:5173`, `http://localhost:5173`). Preflight and requests from external web origins, `null`, or unknown origins are rejected.
4. **IPC Sender Verification & Filesystem Confinement:**
   - IPC handlers verify that invocations originate from the main top-level application frame (`validateSender()`). Filesystem reads are strictly confined to user-selected file paths or the managed jobs directory (`isPathAllowed()`).
5. **Archive Security (Zip-Slip Mitigation):**
   - Archive extraction routines normalize canonical file paths, immediately rejecting directory traversal attempts (`..`), absolute paths, UNC shares, and decompression bombs.
6. **Zero External Cloud Telemetry:**
   - Drone imagery, GPS coordinates, and 3D models are processed strictly on local hardware and never transmitted to external servers. Crash logs written to disk automatically sanitize Bearer tokens and confidential paths.
7. **Container Sandboxing:**
   - Heavy photogrammetry computations (OpenSfM, OpenMVS) execute inside an isolated Docker container, shielding the host operating system from untrusted image processing workloads.