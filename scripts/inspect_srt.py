from pathlib import Path
from pipeline.srt import parse_srt

srt_path = Path(r"testing results\DJI_1001.srt")
print(f"File size: {srt_path.stat().st_size} bytes")

telemetry = parse_srt(srt_path)
print(f"Total telemetry cues: {len(telemetry)}")
if telemetry:
    first = telemetry[0]
    last = telemetry[-1]
    print(f"First cue: t_start={first.t_start}, t_end={first.t_end}, lat={first.latitude}, lon={first.longitude}, alt={first.altitude}, dt={first.timestamp}")
    print(f"Last cue: t_start={last.t_start}, t_end={last.t_end}, lat={last.latitude}, lon={last.longitude}, alt={last.altitude}, dt={last.timestamp}")

# Also inspect the first 20 lines of the raw SRT file
with open(srt_path, 'r', encoding='utf-8', errors='replace') as f:
    lines = [f.readline() for _ in range(30)]
print("\n--- First 30 lines of DJI_1001.srt ---")
print("".join(lines))
