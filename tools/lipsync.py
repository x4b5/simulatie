#!/usr/bin/env python3
"""Maakt een lipsync-tijdlijn per stemregel.

Invoer : tools/words.json  (woorden met begin/eind in seconden, uit ElevenLabs-transcriptie)
Uitvoer: models/lipsync.json
Met een setnaam (python3 tools/lipsync.py kantine): tools/words_kantine.json en
tools/envelope_kantine.json → models/lipsync_kantine.json

Per regel:
  v: [[t, viseme, gewicht, duur], ...]   mondstanden (Oculus/Rocketbox-visemen)
  s: [[t, sterkte], ...]                 nadruk (hoofdletters, uitroepen, lange klinkers)
  b: [[t, duur], ...]                    adempauzes tussen zinsdelen
  e: [0..99, ...]                        luidheid per 20 ms (uit tools/envelope.json)
  w: [[begin, eind, woord], ...]         woorden voor meelezende ondertitels
Gebruik: python3 tools/lipsync.py [set]
"""
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Grafeem → visemen. Langste patronen eerst. Elk item: (viseme, gewicht, relatieve duur)
V = {'aa': 'aa', 'E': 'E', 'I': 'I', 'O': 'O', 'U': 'U'}
RULES = [
    ('sch', [('SS', 0.7, 1.0), ('kk', 0.6, 1.0)]),
    ('aai', [('aa', 0.9, 2.2), ('I', 0.6, 1.0)]),
    ('ooi', [('O', 0.9, 2.0), ('I', 0.6, 1.0)]),
    ('oei', [('U', 0.9, 2.0), ('I', 0.6, 1.0)]),
    ('ij', [('E', 0.8, 1.4), ('I', 0.6, 1.0)]),
    ('ei', [('E', 0.8, 1.4), ('I', 0.6, 1.0)]),
    ('ui', [('O', 0.7, 1.3), ('I', 0.6, 1.0)]),
    ('au', [('aa', 0.9, 1.4), ('U', 0.7, 1.0)]),
    ('ou', [('aa', 0.8, 1.4), ('U', 0.7, 1.0)]),
    ('oe', [('U', 1.0, 2.0)]),
    ('eu', [('O', 0.8, 2.0)]),
    ('ie', [('I', 0.9, 2.0)]),
    ('ee', [('E', 0.9, 2.2)]),
    ('aa', [('aa', 1.0, 2.4)]),
    ('oo', [('O', 1.0, 2.2)]),
    ('uu', [('U', 0.9, 2.0)]),
    ('ch', [('kk', 0.6, 1.1)]),
    ('ng', [('kk', 0.5, 1.0)]),
    ('nk', [('nn', 0.4, 0.6), ('kk', 0.6, 0.8)]),
    ('tj', [('CH', 0.8, 1.0)]),
    ('sj', [('CH', 0.8, 1.0)]),
    ('a', [('aa', 0.9, 1.5)]),
    ('e', [('E', 0.7, 1.2)]),
    ('i', [('I', 0.7, 1.2)]),
    ('o', [('O', 0.8, 1.4)]),
    ('u', [('U', 0.6, 1.2)]),
    ('y', [('I', 0.7, 1.2)]),
    ('p', [('PP', 1.0, 0.9)]),
    ('b', [('PP', 1.0, 0.9)]),
    ('m', [('PP', 1.0, 0.9)]),
    ('f', [('FF', 0.9, 1.0)]),
    ('v', [('FF', 0.9, 1.0)]),
    ('w', [('FF', 0.7, 0.9)]),
    ('t', [('DD', 0.45, 0.8)]),
    ('d', [('DD', 0.45, 0.8)]),
    ('n', [('nn', 0.4, 0.8)]),
    ('l', [('nn', 0.35, 0.9)]),
    ('r', [('RR', 0.6, 0.8)]),
    ('s', [('SS', 0.8, 1.0)]),
    ('z', [('SS', 0.8, 1.0)]),
    ('c', [('kk', 0.6, 0.8)]),
    ('k', [('kk', 0.6, 0.8)]),
    ('q', [('kk', 0.6, 0.8)]),
    ('g', [('kk', 0.6, 1.0)]),
    ('x', [('kk', 0.5, 0.6), ('SS', 0.7, 0.8)]),
    ('j', [('I', 0.5, 0.7)]),
    ('h', []),
]
VOWELS = set('aEIOU'.replace('a', 'aa')) | {'aa'}


def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def word_to_segments(word):
    raw = re.sub(r'[^\wÀ-ÿ]', '', word)
    w = strip_accents(raw).lower()
    # Dubbele medeklinkers samenvoegen (mm, tt, ss, …).
    w = re.sub(r'([bcdfghjklmnpqrstvwxz])\1', r'\1', w)
    # Toonloze e aan het eind van een woord (groene, remmen → schwa).
    segs = []
    i = 0
    while i < len(w):
        for pat, out in RULES:
            if w.startswith(pat, i):
                segs.extend(out)
                i += len(pat)
                break
        else:
            i += 1
    # Eind-schwa zachter en korter.
    if segs and w.endswith('e') and not w.endswith('ee') and len(w) > 2:
        v, g, d = segs[-1]
        segs[-1] = (v, g * 0.55, d * 0.7)
    return segs


def stress_of(word):
    letters = [c for c in word if c.isalpha()]
    caps = sum(1 for c in letters if c.isupper())
    s = 0.0
    if len(letters) >= 2 and caps >= len(letters) * 0.6:
        s = 1.0  # HÉ, JIJ, ALTIJD
    elif re.search(r'[áéíóú]', word):
        s = 0.85  # Dáár
    elif '!' in word:
        s = 0.6
    elif '?' in word:
        s = 0.35
    return s


REF_RMS = 0.33  # absolute luidheid die als "vol" geldt


def env_at(env, t):
    i = int(round(t / env['hop']))
    if i < 0 or i >= len(env['env']):
        return 0.0
    return env['env'][i]


def peak_in(env, a, b):
    """Tijdstip van de luidste frame tussen a en b."""
    hop = env['hop']
    i0, i1 = max(0, int(a / hop)), min(len(env['env']) - 1, int(b / hop) + 1)
    if i1 <= i0:
        return (a + b) / 2, 0.0
    best = max(range(i0, i1 + 1), key=lambda i: env['env'][i])
    return best * hop, env['env'][best]


def build(entry, env=None):
    words = [w for w in entry['words'] if not w['w'].endswith(']')]
    vis, stress, breaths = [], [], []
    prev_end = 0.0
    for idx, w in enumerate(words):
        s, e = w['s'], w['e']
        gap = s - prev_end
        if idx > 0 and gap > 0.28:
            breaths.append([round(prev_end + 0.03, 3), round(min(gap, 0.9), 3)])
        if idx == 0 and s > 0.25:
            breaths.append([0.0, round(min(s, 0.9), 3)])
        st = stress_of(w['w'])
        if st > 0:
            stress.append([round(s + 0.04, 3), st])
        segs = word_to_segments(w['w'])
        if not segs:
            prev_end = e
            continue
        dur = max(0.06, e - s)
        total = sum(d for _, _, d in segs)
        t = s
        for v, g, d in segs:
            sd = dur * d / total
            c = t + sd / 2
            is_vowel = v in ('aa', 'E', 'I', 'O', 'U')
            boost = 1.0 + (0.25 * st if is_vowel else 0)
            if env and is_vowel:
                # Klinker op de luidste plek van de lettergreep leggen (binnen het woord).
                pc, lv = peak_in(env, max(s, c - 0.07), min(e, c + 0.07))
                c = pc if lv > 0.05 else c
                boost *= 0.55 + 0.6 * min(1.0, lv / 0.6)
            vis.append([round(c, 3), v, round(min(1.0, g * boost), 2), round(sd, 3)])
            t += sd
        prev_end = e
    vis.sort(key=lambda k: k[0])
    out = {'dur': entry['dur'], 'v': vis, 's': stress, 'b': breaths,
           'w': [[w['s'], w['e'], w['w']] for w in words]}
    if env:
        # Luidheid per 20 ms (0..99), absoluut geschaald: stuurt kaak en sluiten bij stilte.
        scale = env['max'] / REF_RMS
        frames = env['env'][::2]
        out['e'] = [min(99, int(round(v * scale * 99))) for v in frames]
    return out


def main():
    suffix = '_' + sys.argv[1] if len(sys.argv) > 1 else ''
    src = json.load(open(os.path.join(ROOT, 'tools', f'words{suffix}.json'), encoding='utf-8'))
    env_path = os.path.join(ROOT, 'tools', f'envelope{suffix}.json')
    envs = json.load(open(env_path)) if os.path.exists(env_path) else {}
    out = {k: build(v, envs.get(k)) for k, v in src.items()}
    path = os.path.join(ROOT, 'models', f'lipsync{suffix}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    for k, v in out.items():
        print(k, len(v['v']), 'visemen,', len(v['s']), 'nadruk,', len(v['b']), 'adem')
    print('→', path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
