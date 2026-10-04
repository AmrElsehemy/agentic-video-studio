"""When each narration word is spoken, by forced alignment (#86).

Matches each scene's known narration to its stretch of the track with
torchaudio's MMS forced aligner: free, local and far more precise than a
transcript, because the words are given rather than guessed.

    python3 scripts/align-words.py <track-16k-mono.wav> <scenes.json>

scenes.json is [{"id", "narration", "start", "duration"}] (seconds into the
track). Prints {scene id: [{"text", "start", "end"}]} with times in seconds
from the scene's start; a scene that can't be aligned is left out.
Needs: pip install torch torchaudio num2words (the model downloads on first use).
"""
import json
import re
import sys
import unicodedata
import wave

import numpy as np
import torch
import torchaudio
from num2words import num2words


def spoken(token):
    """The words a narration token is said as, in the aligner's alphabet (a-z)."""
    bare = token.strip(",.!?;:\"'()[]—–")
    number = re.fullmatch(r"(\d[\d,]*)(s?)", bare)
    if number:
        value = int(number.group(1).replace(",", ""))
        # A plain four-digit number in narration is almost always a year: "1877" is "eighteen seventy-seven".
        text = num2words(value, to="year") if 1000 <= value <= 2099 and "," not in number.group(1) else num2words(value)
        text += number.group(2)
    elif re.fullmatch(r"[A-Z]{2,5}", bare):
        text = " ".join(bare.lower())
    else:
        text = bare
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return [word for word in (re.sub(r"[^a-z]", "", part) for part in re.split(r"[\s-]+", text)) if word]


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: python3 scripts/align-words.py <track-16k-mono.wav> <scenes.json>")
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=False)
    dictionary = bundle.get_dict(star=None)
    with wave.open(sys.argv[1]) as track:
        if track.getframerate() != bundle.sample_rate or track.getnchannels() != 1:
            sys.exit(f"Expected {bundle.sample_rate} Hz mono audio.")
        samples = np.frombuffer(track.readframes(track.getnframes()), dtype=np.int16)
    audio = torch.from_numpy(samples.astype(np.float32) / 32768).unsqueeze(0)
    result = {}
    for scene in json.load(open(sys.argv[2])):
        tokens = [token for token in scene["narration"].split() if re.search(r"\w", token)]
        said = [spoken(token) for token in tokens]
        letters = [dictionary[char] for words in said for word in words for char in word]
        if not tokens or any(not words for words in said):
            continue
        a = int(scene["start"] * bundle.sample_rate)
        b = int((scene["start"] + scene["duration"]) * bundle.sample_rate)
        with torch.inference_mode():
            emission, _ = model(audio[:, a:b])
        try:
            path, scores = torchaudio.functional.forced_align(emission, torch.tensor([letters], dtype=torch.int32), blank=0)
        except RuntimeError:
            continue  # The scene's audio is too short for its words; it keeps the estimated timing.
        spans = torchaudio.functional.merge_tokens(path[0], scores[0].exp())
        seconds = (b - a) / emission.size(1) / bundle.sample_rate
        index, words = 0, []
        for token, parts in zip(tokens, said):
            length = sum(len(part) for part in parts)
            first, last = spans[index], spans[index + length - 1]
            words.append({"text": token, "start": round(first.start * seconds, 3), "end": round(last.end * seconds, 3)})
            index += length
        result[scene["id"]] = words
    print(json.dumps(result))


if __name__ == "__main__":
    main()
