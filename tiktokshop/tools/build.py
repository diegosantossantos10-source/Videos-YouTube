"""Genera voces (edge-tts), timeline.json para el render y la mezcla de audio de un episodio.

Uso:  python tools/build.py episodes/cap02-60-cajas            (usa caché de voces)
      python tools/build.py episodes/cap02-60-cajas --fresh    (regenera las voces)
Salida: <episodio>/build/{voice/, timeline.json, mix.wav}
"""
import asyncio, json, math, os, subprocess, sys, wave, hashlib
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
EP = os.path.abspath(args[0] if args else os.path.join(ROOT, "episodes", "cap01-afiliado"))
BUILD = os.path.join(EP, "build")
VOICE_DIR = os.path.join(BUILD, "voice")
FPS = 30
SR = 48000
os.makedirs(VOICE_DIR, exist_ok=True)

script = json.load(open(os.path.join(EP, "script.json"), encoding="utf-8"))
DEFAULT_VOICES = {
    "leo": {"voice": "es-MX-JorgeNeural", "rate": "+10%", "pitch": "+0Hz"},
    "claude": {"voice": "es-US-AlonsoNeural", "rate": "+6%", "pitch": "+0Hz"},
}
VOICES = {**DEFAULT_VOICES, **script.get("voices", {})}


# ---------------------------------------------------------------- voces
async def synth(text, voice, rate, pitch, volume, out_mp3):
    import edge_tts
    for attempt in range(4):
        try:
            c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume)
            await c.save(out_mp3)
            return
        except Exception:
            if attempt == 3:
                raise
            await asyncio.sleep(2 ** attempt)


def load_wav_mono(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def trim(sig, thr=0.012, pad=0.03, max_gap=0.2):
    idx = np.where(np.abs(sig) > thr)[0]
    if len(idx) == 0:
        return sig
    a = max(0, idx[0] - int(pad * SR))
    b = min(len(sig), idx[-1] + int(pad * SR * 2))
    sig = sig[a:b]
    # comprime silencios internos largos (pausas de puntuación del TTS)
    hop = int(0.01 * SR)
    loud = np.array([np.max(np.abs(sig[k:k + hop])) > thr for k in range(0, len(sig), hop)])
    keep = np.ones(len(sig), dtype=bool)
    k = 0
    while k < len(loud):
        if not loud[k]:
            j = k
            while j < len(loud) and not loud[j]:
                j += 1
            if (j - k) * hop / SR > max_gap:
                keep[k * hop + int(max_gap / 2 * SR): j * hop - int(max_gap / 2 * SR)] = False
            k = j
        else:
            k += 1
    return sig[keep]


async def make_voices(fresh):
    jobs = []
    for i, b in enumerate(script["beats"]):
        if "who" not in b:
            continue
        v = dict(VOICES[b["who"]])
        v.update(b.get("voice", {}))
        text = b.get("say", b["text"])
        key = hashlib.md5(json.dumps([text, v], sort_keys=True).encode()).hexdigest()[:10]
        mp3 = os.path.join(VOICE_DIR, f"{i:02d}_{key}.mp3")
        b["_mp3"] = mp3
        if fresh or not os.path.exists(mp3):
            jobs.append(synth(text, v["voice"], v.get("rate", "+0%"), v.get("pitch", "+0Hz"),
                              v.get("volume", "+0%"), mp3))
    for k in range(0, len(jobs), 6):
        await asyncio.gather(*jobs[k:k + 6])


asyncio.run(make_voices("--fresh" in sys.argv))


def envelope(sig):
    hop = SR // FPS
    n = int(math.ceil(len(sig) / hop))
    env = np.array([np.sqrt(np.mean(sig[k * hop:(k + 1) * hop] ** 2) + 1e-12) for k in range(n)])
    env = np.clip(env / (np.percentile(env, 92) + 1e-6), 0, 1)
    sm = np.convolve(env, [0.25, 0.5, 0.25], mode="same")
    sm = np.clip((sm - 0.12) / 0.88, 0, 1)
    return [round(float(x), 3) for x in sm]


# ---------------------------------------------------------------- tiempos internos de cada tarjeta
def card_events(c):
    kind = c["card"]
    if kind == "stats":
        return {"count": [0.35, 2.0], "badge": 2.15, "money": [2.75, 3.6], "deposit": 3.95}
    if kind in ("message", "order"):
        return {"time": 0.85, "sent": 1.45, "reply": 2.85}
    if kind == "notifs":
        items = [round(0.35 + i * 0.48, 2) for i in range(len(c["items"]))]
        t0 = items[-1] + 0.45
        return {"items": items, "total": [round(t0, 2), round(t0 + 0.8, 2)]}
    if kind == "compare":
        bars = [[round(0.45 + i * 1.15, 2), round(1.35 + i * 1.15, 2)] for i in range(len(c["bars"]))]
        return {"bars": bars, "foot": round(bars[-1][1] + 0.3, 2)}
    if kind == "graph":
        ev = {"line": [0.4, 2.6], "big": [2.85, 3.75]}
        if c.get("mark"):
            ev["mark"] = round(0.4 + 2.2 * c["mark"]["at"], 2)
        return ev
    if kind == "chat":
        out, t = [], 0.45
        for m in c["msgs"]:
            if not m.get("me"):
                t += 0.55  # indicador "escribiendo..."
            out.append(round(t, 2))
            t += 1.05
        return {"msgs": out}
    if kind == "billboard":
        return {"views": [0.5, 1.6], "stamp": 2.0}
    raise ValueError(kind)


t = 0.0
beats_out, voices = [], []
card_i = 0
for i, b in enumerate(script["beats"]):
    if "card" in b:
        data = {k: v for k, v in b.items() if k not in ("card", "dur")}
        ev = card_events(b)
        beats_out.append({"type": "card", "card": b["card"], "start": round(t, 3), "end": round(t + b["dur"], 3),
                          "ev": ev, "data": data, "cardIndex": card_i})
        card_i += 1
        t += b["dur"]
        continue
    sig = trim(load_wav_mono(b["_mp3"]))
    dur = len(sig) / SR
    mood = b.get("mood", "")
    pre = 0.35 if i == 0 else (0.12 if mood == "shock" else 0.22)
    post = 0.5 if mood == "shock" else 0.32
    if i + 1 < len(script["beats"]) and "card" in script["beats"][i + 1]:
        post += 0.15
    cta = b.get("cta")
    if cta:
        pre, post = 0.3, 2.0
    a0 = t + pre
    voices.append((a0, sig))
    beat = {"type": "line", "who": b["who"], "shot": b["shot"], "mood": mood, "text": b["text"],
            "start": round(t, 3), "end": round(a0 + dur + post, 3), "a0": round(a0, 3), "a1": round(a0 + dur, 3),
            "env": envelope(sig)}
    if cta:
        beat["cta"] = cta
        beat["ev"] = {"show": 0.35, "tap": round(pre + dur * 0.55 + 0.3, 2)}
    beats_out.append(beat)
    t = a0 + dur + post

TOTAL = round(t + 0.4, 3)
timeline = {"fps": FPS, "w": 1080, "h": 1920, "duration": TOTAL, "beats": beats_out,
            "set": script.get("set", {}), "screen": script.get("screen", {})}
json.dump(timeline, open(os.path.join(BUILD, "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"{os.path.basename(EP)}: {TOTAL:.2f}s  ({int(round(TOTAL * FPS))} frames)")


# ---------------------------------------------------------------- SFX sintéticos
rng = np.random.default_rng(script.get("music", {}).get("seed", 7))
N = int((TOTAL + 1) * SR)


def tt(d):
    return np.arange(int(d * SR)) / SR


def lp(x, a):  # paso bajo de un polo
    y = np.empty_like(x); acc = 0.0
    for k in range(len(x)):
        acc += a * (x[k] - acc); y[k] = acc
    return y


def whoosh(d=0.45, up=True):
    x = rng.standard_normal(int(d * SR)).astype(np.float32)
    s = np.linspace(0, 1, len(x))
    env = np.sin(np.pi * (s ** (0.6 if up else 1.4))) ** 2
    a = lp(x, 0.05); b = lp(x, 0.35)
    mix = (a * (1 - s) + b * s) if up else (b * (1 - s) + a * s)
    return 0.55 * mix * env


def blip(f=1400, d=0.05):
    x = tt(d)
    return 0.18 * np.sin(2 * np.pi * f * x) * np.exp(-x * 60)


def pop(d=0.12):
    x = tt(d)
    f = 900 * np.exp(-x * 25) + 250
    return 0.45 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 30)


def bell(f0, d=1.2, amp=0.25):
    x = tt(d)
    out = np.zeros_like(x)
    for r, a, dec in [(1, 1, 3), (2.76, 0.5, 5), (5.4, 0.25, 8), (8.93, 0.12, 12)]:
        out += a * np.sin(2 * np.pi * f0 * r * x) * np.exp(-x * dec)
    return amp * out / 1.9


def cha_ching():
    x = np.zeros(int(1.4 * SR), dtype=np.float32)
    n = rng.standard_normal(int(0.08 * SR)) * np.exp(-tt(0.08) * 50) * 0.35
    x[:len(n)] += n
    b1 = bell(2093, 1.0, 0.22); x[int(0.02 * SR):int(0.02 * SR) + len(b1)] += b1
    b2 = bell(2637, 1.2, 0.26); x[int(0.14 * SR):int(0.14 * SR) + len(b2)] += b2
    return x


def ping(f1=1318.5, f2=1975.5, amp=0.2):
    x = np.zeros(int(0.9 * SR), dtype=np.float32)
    for off, f in [(0, f1), (0.09, f2)]:
        s = tt(0.7)
        y = amp * np.sin(2 * np.pi * f * s) * np.exp(-s * 6)
        x[int(off * SR):int(off * SR) + len(y)] += y
    return x


def hit():
    s = tt(0.5)
    f = 110 * np.exp(-s * 4) + 45
    return 0.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-s * 7)


def rise(d=2.2):
    s = tt(d)
    f = 300 + 900 * (s / d) ** 1.5
    return 0.05 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * s / d)


def sparkle():
    x = np.zeros(int(1.0 * SR), dtype=np.float32)
    for k, f in enumerate([1568, 1976, 2349, 3136]):
        b = bell(f, 0.6, 0.08); i0 = int(k * 0.06 * SR); x[i0:i0 + len(b)] += b
    return x


sfx = np.zeros(N, dtype=np.float32)


def put(sig, at, gain=1.0):
    i = int(at * SR)
    j = min(N, i + len(sig))
    if 0 <= i < N:
        sfx[i:j] += gain * sig[:j - i]


for b in beats_out:
    s = b["start"]
    if b["type"] == "line":
        if b["mood"] == "shock" or b["shot"] in ("leoXClose", "leoFeet"):
            put(whoosh(0.28, True), max(0, s - 0.08), 0.8)
            put(hit(), s + 0.06, 0.7)
        if b.get("cta"):
            put(whoosh(0.4, True), s + b["ev"]["show"] - 0.15, 0.6)
            put(pop(), s + b["ev"]["show"] + 0.05, 0.8)
            put(pop(0.08), s + b["ev"]["tap"], 1.0)
            put(sparkle(), s + b["ev"]["tap"] + 0.03, 1.0)
        continue
    ev, kind = b["ev"], b["card"]
    put(whoosh(0.5, True), max(0, s - 0.15), 0.9)
    if kind == "stats":
        c0, c1 = ev["count"]
        for k, tk in enumerate(np.linspace(0, 1, 18)):
            put(blip(1200 + 40 * k, 0.04), s + c0 + (c1 - c0) * tk, 0.8)
        if b["data"].get("pill"):
            put(pop(), s + ev["badge"], 0.9)
        if b["data"].get("money"):
            put(cha_ching(), s + ev["money"][1] - 0.05, 1.0)
    elif kind in ("message", "order"):
        put(whoosh(0.3, False), s + ev["sent"] - 0.05, 0.6)
        put(pop(), s + ev["sent"], 0.7)
        if b["data"].get("reply"):
            put(ping(), s + ev["reply"], 1.0)
    elif kind == "notifs":
        for k, at in enumerate(ev["items"]):
            put(ping(1318.5 + 60 * k, 1975.5 + 60 * k, 0.14), s + at, 1.0)
        if b["data"].get("total"):
            put(cha_ching(), s + ev["total"][1] - 0.05, 1.0)
    elif kind == "compare":
        for k, (a, z) in enumerate(ev["bars"]):
            for q in np.linspace(0, 1, 8):
                put(blip(900 + 300 * k + 60 * q * 8, 0.035), s + a + (z - a) * q, 0.7)
        put(cha_ching(), s + ev["bars"][-1][1], 1.0)
        put(pop(), s + ev["foot"], 0.7)
    elif kind == "graph":
        put(rise(ev["line"][1] - ev["line"][0]), s + ev["line"][0], 1.0)
        if "mark" in ev:
            put(pop(), s + ev["mark"], 0.9)
        if b["data"].get("big"):
            put(cha_ching(), s + ev["big"][1] - 0.05, 1.0)
    elif kind == "chat":
        for k, (m, at) in enumerate(zip(b["data"]["msgs"], ev["msgs"])):
            put(whoosh(0.18, True) * 0.6 if m.get("me") else ping(1174.7, 1568, 0.15), s + at - (0.05 if m.get("me") else 0), 1.0)
    elif kind == "billboard":
        put(pop(), s + ev["stamp"], 0.9)
        put(cha_ching(), s + ev["stamp"] + 0.1, 0.9)


# ---------------------------------------------------------------- música (lo-fi suave, variante por episodio)
PROGS = [
    ([[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 62]], [41, 40, 38, 36]),
    ([[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]], [45, 41, 48, 43]),
    ([[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 60, 64, 67]], [38, 43, 36, 45]),
    ([[51, 55, 58, 62], [50, 53, 57, 60], [48, 51, 55, 58], [46, 50, 53, 58]], [39, 38, 36, 34]),
    ([[55, 59, 62, 66], [54, 57, 61, 64], [52, 55, 59, 62], [57, 61, 64, 67]], [43, 42, 40, 45]),
    ([[48, 52, 55, 59], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], [36, 45, 41, 43]),
]
MUS = script.get("music", {})


def music(total):
    bpm = MUS.get("bpm", 84); beat = 60 / bpm; bar = 4 * beat
    chords, bass = PROGS[MUS.get("prog", 0) % len(PROGS)]
    out = np.zeros(int(total * SR), dtype=np.float32)
    midi = lambda m: 440 * 2 ** ((m - 69) / 12)

    def add(y, at):
        i = int(at * SR); j = min(len(out), i + len(y))
        if i < len(out):
            out[i:j] += y[:j - i]
    for k in range(int(total / bar) + 1):
        t0 = k * bar
        ch = chords[k % 4]
        for hitt in (0, 2.5 * beat):
            d = bar - hitt if hitt else 2.5 * beat
            s = tt(d + 0.6)
            env = np.minimum(1, s / 0.02) * np.exp(-s * 1.1)
            y = np.zeros_like(s)
            for m in ch:
                f = midi(m + 12)
                y += np.sin(2 * np.pi * f * s) + 0.25 * np.sin(2 * np.pi * 2 * f * s) * np.exp(-s * 3)
            add(0.035 * env * y, t0 + hitt)
        s = tt(bar)
        add(0.09 * np.sin(2 * np.pi * midi(bass[k % 4]) * s) * np.minimum(1, s / 0.01) * np.exp(-s * 0.9), t0)
        for q in range(4):
            tb = t0 + q * beat
            if q in (0, 2):
                s = tt(0.25); f = 90 * np.exp(-s * 18) + 42
                add(0.22 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-s * 14), tb)
            for h in (0, 0.5):
                s = tt(0.05)
                y = (0.025 * rng.standard_normal(len(s)) * np.exp(-s * 90)).astype(np.float32)
                add(y - lp(y, 0.3), tb + h * beat)
    fade = int(1.2 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)
    out[:int(0.3 * SR)] *= np.linspace(0, 1, int(0.3 * SR))
    return out


mus = np.zeros(N, dtype=np.float32)
m = music(TOTAL + 0.2)
mus[:len(m)] = m

voice = np.zeros(N, dtype=np.float32)
for a0, sig in voices:
    sig = sig / (np.max(np.abs(sig)) + 1e-6) * 0.85
    i = int(a0 * SR); voice[i:i + len(sig)] += sig

act = np.convolve((np.abs(voice) > 0.02).astype(np.float32), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
duck = 1 - 0.55 * np.clip(act * 3, 0, 1)
mix = voice + 0.75 * sfx + 0.55 * mus * duck
mix = mix / max(1.0, np.max(np.abs(mix)) / 0.95)

pcm = (np.clip(np.stack([mix, mix], axis=1), -1, 1) * 32767).astype(np.int16)
wav_path = os.path.join(BUILD, "mix.wav")
with wave.open(wav_path, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("audio:", wav_path)
