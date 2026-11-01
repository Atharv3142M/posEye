from __future__ import annotations


class PipelineError(RuntimeError):
    code = "UNKNOWN"

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        if code:
            self.code = code


class ExtractError(PipelineError):
    code = "VIDEO_UNREADABLE"


class ExtractCanceledError(ExtractError):
    code = "CANCELLED"


class InputInvalid(PipelineError):
    code = "INPUT_INVALID"


class VideoUnreadable(ExtractError):
    code = "VIDEO_UNREADABLE"


class SrtInvalid(PipelineError):
    code = "SRT_INVALID"


class NotEnoughFrames(ExtractError):
    code = "NOT_ENOUGH_FRAMES"


class FfmpegUnavailable(PipelineError):
    code = "FFMPEG_UNAVAILABLE"


class MaskingFailed(PipelineError):
    code = "MASKING_FAILED"


class NodeOdmUnavailable(PipelineError):
    code = "NODEODM_UNAVAILABLE"


class NodeOdmFailed(PipelineError):
    code = "NODEODM_FAILED"


class ConversionFailed(PipelineError):
    code = "CONVERSION_FAILED"


class Cancelled(PipelineError):
    code = "CANCELLED"
