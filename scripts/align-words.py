"""Word-level transcript of a narration track, for measuring caption drift (#86).

Prints [{"text", "start", "end"}] (seconds) as JSON. Runs locally and free with
faster-whisper (pip install faster-whisper); the model downloads on first use.

    python3 scripts/align-words.py public/generated/silk-road-voice.wav > words.json
"""
import json
import sys

from faster_whisper import WhisperModel

if len(sys.argv) < 2:
    sys.exit("Usage: python3 scripts/align-words.py <track.wav> [model]")
model = WhisperModel(sys.argv[2] if len(sys.argv) > 2 else "small.en", device="cpu", compute_type="int8")
segments, _ = model.transcribe(sys.argv[1], word_timestamps=True, beam_size=5)
print(json.dumps([{"text": word.word.strip(), "start": round(word.start, 3), "end": round(word.end, 3)} for segment in segments for word in segment.words]))
