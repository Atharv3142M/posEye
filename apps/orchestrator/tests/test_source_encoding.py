import ast
from pathlib import Path

def test_no_null_bytes_or_utf16_in_python_sources():
    """Regression test: verify no Python files in the repository contain NUL bytes,
    UTF-16 BOMs, or invalid UTF-8 encodings (fixes CI collection failures)."""
    repo_root = Path(__file__).resolve().parents[3]
    py_files = list(repo_root.glob("apps/**/*.py"))
    assert len(py_files) > 20, "Should discover Python sources in apps/"

    for py_file in py_files:
        # Skip virtualenvs or cache if present in apps
        if ".venv" in py_file.parts or "__pycache__" in py_file.parts:
            continue
        data = py_file.read_bytes()
        assert b"\x00" not in data, f"Found NUL byte in {py_file}"
        assert not data.startswith(b"\xff\xfe"), f"Found UTF-16 LE BOM in {py_file}"
        assert not data.startswith(b"\xfe\xff"), f"Found UTF-16 BE BOM in {py_file}"
        
        # Must be valid UTF-8
        text = data.decode("utf-8")
        # Must be valid Python syntax
        ast.parse(text, filename=str(py_file))
