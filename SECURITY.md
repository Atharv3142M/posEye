# Security Policy

posEye takes the security of its desktop application, data isolation, and processing pipeline seriously.

---

## 1. Supported Versions

Security updates and patches are actively provided for the following versions:

| Version | Supported | Status |
| :--- | :--- | :--- |
| `0.1.x` | Yes | Current pre-release / Developer preview |
| `< 0.1.0` | No | Deprecated development prototypes |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability or potential threat in posEye, please report it responsibly:

- **Preferred Method:** Use GitHub's **Private Vulnerability Reporting** feature:
  Navigate to [Security Advisories](https://github.com/Atharv3142M/posEye/security/advisories) $\rightarrow$ **Report a vulnerability**.
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

1. **Local Host Binding:**
   - Both the Python Orchestrator API (`http://127.0.0.1:8765`) and the NodeODM Docker container (`http://127.0.0.1:3000`) bind exclusively to loopback addresses (`127.0.0.1`), preventing external network access to the processing pipeline.
2. **Zero Cloud Telemetry:**
   - Drone imagery, GPS coordinates, and 3D models are never transmitted to external cloud servers.
3. **Container Sandboxing:**
   - Photogrammetry computations (OpenSfM, OpenMVS) execute within a Docker container, isolating compute-heavy processes from the host operating system.
4. **Input Sanitization:**
   - Video file paths and subtitle inputs are validated on the backend before being passed to subprocesses, mitigating path traversal and command injection risks.

